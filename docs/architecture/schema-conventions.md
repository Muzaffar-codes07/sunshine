# Schema conventions and migration queue

Backlog item I01. D3 coordinates; each owner writes their own models and migrations (see the [handoff board](https://github.com/Muzaffar-codes07/sunshine/issues/2)). The [data model](data-model.md) lists the planned tables. Its owner column predates the board, and the board wins.

## Conventions

These follow the existing `users` table and the data model.

| Item | Rule |
|---|---|
| Tables | Plural `snake_case` through `@@map`, such as `service_tickets` |
| Columns | `camelCase`, as in `users` |
| Primary keys | `String @id @default(uuid()) @db.Uuid` |
| Money | `Decimal @db.Decimal(14,2)`, sent over the API as a decimal string |
| Quantities | `Decimal @db.Decimal(12,3)`; whole-number counts may use `Int` |
| Timestamps | `DateTime @db.Timestamptz(3)`, stored in UTC |
| Calendar dates | `DateTime @db.Date`, for warranty start and expiry in IST |
| Statuses | A Prisma enum per workflow, not free text |
| Foreign keys | Explicit, with `onDelete: Restrict` unless there's a stated reason |
| Mutable workflow records | `version Int @default(1)` for stale-write checks |
| Corrections | Reversal rows for posted money and stock, never destructive edits |
| Hand-written constraint names | `<table>_<rule>`, such as `allocations_one_active_per_unit` |

## Migration queue

One shared `prisma/schema.prisma`, with each owner's models kept in their own section. Migrations land in foreign-key order, so a later table can reference an earlier one. Two items with no link between them can swap.

| # | Migration | Owner | Status |
|---:|---|---|---|
| 0 | `platform`: `User` | - | Merged |
| 1 | `Customer`, `Enquiry`, then `Survey` | D2 | **Next, for the first review** |
| 2 | `Session`, `AuditEntry`, `Command`, `File` | D2 | Queued |
| 3 | `Product`, `Package`, `PackageItem` | D2 | Queued |
| 4 | `Quote`, `QuoteLine`, `Order`, `Invoice`, `InvoiceLine`, `Payment` | D2 | Queued |
| 5 | `Job`, `JobAssignment`, `TimeEntry` | D3 | Queued |
| 6 | `CostEntry` | D4 | Queued; dispatch posts through it |
| 7 | `StockBalance`, `Unit`, `StockMovement`, `Allocation`, `Dispatch`, scan records | D3 | Queued |
| 8 | `Warranty`, `ServiceTicket`, `TicketLine`, `SubsidyMilestone` | D4 | Queued |

**To land a migration:**

1. Tell D3 you're about to, then update from `main`.
2. Edit `prisma/schema.prisma` in your section.
3. Run `npx prisma migrate dev --name <what> --create-only`, then read the generated SQL.
4. Add any hand-written constraints to that file, and list each one in `prisma/required-constraints.json`.
5. Run `npx prisma migrate dev`, then `npm run db:check`.
6. Put the schema, migration and manifest changes in one small PR. D3 reviews it.

**Don't:**

- Edit a migration that's already on `main`. Add a new one.
- Run `migrate reset` on a database someone is using.
- Apply SQL by hand without a migration.

`migrate dev` needs an interactive terminal. Prisma also refuses `migrate reset` when an AI agent runs it. Don't set its override variable to get past that; use a disposable database instead.

## What Prisma does and doesn't protect

Tested on 31 Oct 2026 with Prisma 7.10.1, PostgreSQL 17 and Node 25, on a throwaway database. The test used a CHECK, a partial unique index and an exclusion constraint. The test code isn't in the repo.

| Question | Result |
|---|---|
| Does a later migration drop hand-written constraints? | No. The generated SQL only added the new column |
| Do they survive `migrate deploy` on a clean database? | Yes |
| Does Prisma report when one is missing? | **No.** After dropping the partial index, `migrate diff --exit-code` returned 0 and `migrate status` said up to date |
| Can Prisma hold an exclusion constraint's range column? | Yes, as `Unsupported("tstzrange")`, but the client can't write it, so those inserts use parameterized raw SQL |

Because of the third result, **`npm run db:check` reads the database directly and fails if a listed constraint is missing or wrong. CI runs it after migrating.**

## Locks and errors

Row locks work inside `$transaction` through the driver adapter. Two concurrent reservations of the last unit, 20 rounds each:

| Approach | One winner each round | What the loser receives |
|---|---|---|
| `SELECT ... FOR UPDATE`, then check and update | 20 of 20 | The app's own `INSUFFICIENT_STOCK` |
| No lock, CHECK constraint only | 20 of 20 | A raw database error, `P2010` |

So use both: the lock gives a clean refusal, and the constraint is the backstop. Lock rows in a stable order, such as `ORDER BY id`, and do no file or network work while holding locks.

Two concurrent active allocations of one unit also had one winner in 20 of 20 rounds, and the unit could be allocated again after release.

**What Prisma raises when a constraint refuses a write:**

| Refused by | Through | Prisma code | SQLSTATE |
|---|---|---|---|
| Unique or partial unique index | Client | `P2002` | Constraint name is in the message |
| CHECK | Client | `P2039` | `23514` |
| CHECK or exclusion | Raw SQL | `P2010` | `23514`, `23P01` |

The SQLSTATE and constraint name are in `error.meta.driverAdapterError.cause` (`originalCode`, `originalMessage`). Map those to business errors, such as `UNIT_ALREADY_ASSIGNED`, rather than matching on the Prisma code alone. The shared error mapping belongs to D2, under API standards.
