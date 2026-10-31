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

Stated foreign-key exceptions (keep the reason next to the relation in `schema.prisma` too):

| Relation | `onDelete` | Reason |
|---|---|---|
| `enquiries.ownerId` → `users` | `SetNull` | The owner is a work assignment, not a record of who did something. Removing a staff user must neither be blocked by their open enquiries nor delete them; the enquiry goes back to the unassigned queue |

## Migration queue

One shared `prisma/schema.prisma`, with each owner's models kept in their own section. Migrations land in foreign-key order, so a later table can reference an earlier one. Two items with no link between them can swap.

| # | Migration | Owner | Status |
|---:|---|---|---|
| 0 | `platform`: `User` | - | Merged |
| 1 | `Customer`, `Enquiry` (`20261031100000_sales_enquiry`) | D2 | Merged in #6 (`854b96e`); nine CHECKs registered here |
| 1b | `enquiries.monthlyBillInr` to `Decimal(14,2)` (`20261031120000_enquiry_bill_money`) | D2 | Merged in #12 |
| 2a | `Session` (`20261031110000_auth_sessions`) | D2 | Merged in #9 |
| 2b | `Survey` (`20261031140000_survey`) | D2 | C4; eight CHECKs and `surveys_one_open_per_enquiry` registered here |
| 2c | `AuditEntry`, `File` | D2 | Queued; coordinate independent changes rather than waiting for unrelated tables |
| 2d | `Command` (`20261031150000_commands`) | D2 | C7, idempotent command results; three CHECKs registered here |
| 3 | `Product`, `Package`, `PackageItem` | D2 | Queued |
| 4a | `Quote`, `QuoteLine` (`20261031170000_quotes`) | D2 | X4 (#26) |
| 4b | `Order`, `PackingRequirement`, `Invoice`, `InvoiceLine`, `Payment` (`20261031180000_orders`) | D2 | C5; eleven CHECKs registered here; see [orders handoff](orders-handoff.md) |
| 5 | `Job`, `JobAssignment`, installation time records | D3 | Queued |
| 6 | `CostEntry` | D4 | Queued; D3 calls its single writer with typed unique source IDs; do not require an FK to an uncreated stock table |
| 7 | Stock state, `Unit`, movements, `Allocation`, `Dispatch`, scan records | D3 | `20261031200000_inventory` holds locations, documents, movements, `Unit` and cost basis; `20261031210000_stock_transfers_counts` adds count fields and a draft's planned units; `Allocation`, `Dispatch` and scan records follow. Derived ledger, with no stored balance; see the [data model](data-model.md) |
| 8 | `Warranty`, `ServiceTicket`, `TicketLine`, `SubsidyMilestone` | D4 | Queued |

**To land a migration:**

1. Tell D3 you're about to, then update from `main`.
2. Edit `prisma/schema.prisma` in your section.
3. Run `npx prisma migrate dev --name <what> --create-only`, then read the generated SQL.
4. Add any hand-written constraints to that file, and list each one in `prisma/required-constraints.json`, including its canonical PostgreSQL 17 definition.
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

Because of the third result, **`npm run db:check` reads the database directly and fails if a listed constraint is missing or wrong. CI runs it after migrating. The manifest now includes the nine CHECKs from merged #6 (D2 follow-up C1b); no applied migration was edited.**

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

## Exact-definition checks and reproducible regression

A same-name rule of the correct kind is insufficient: `CHECK (true)` and a unique partial index on the wrong key/predicate passed the original checker. The revised checker qualifies by the URL’s schema, table and name, verifies validation/index readiness, and compares the full canonical definition returned by `pg_get_constraintdef` or `pg_get_indexdef`. It rejects incomplete/duplicate/empty manifests and also fails on any unlisted CHECK, exclusion or partial unique index in the target schema. `pg` does not apply Prisma’s `?schema=` parameter, so the checker sets a quoted search path and explicitly scopes catalog lookups.

Capture definitions on the pinned PostgreSQL 17.11 server after applying the reviewed migration. For example:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'enquiries'::regclass AND contype = 'c';
SELECT pg_get_indexdef('allocations_one_active_per_unit'::regclass);
```

Copy the returned definition exactly into the manifest’s `definition` field, alongside `name`, `table`, `kind` and `owner`. Do not blindly update the manifest to match a changed database: first establish that the new definition is the intended migration. Canonical text can change with PostgreSQL versions; a version upgrade needs explicit review rather than weakened matching. PostgreSQL 17.11 is pinned in the checker CI job. Arbitrary equivalent SQL formatting is not normalized away, and wrong predicates must fail.

The checker also covers triggers, views and functions, because the append-only ledger and derived on-hand depend on them. A disabled trigger counts as wrong, and a trigger whose function was emptied fails on the function's definition. For a view or function, `table` repeats its name.

Run `npm run test:constraints` with an explicit `TEST_DATABASE_URL` naming a disposable test database. The suite creates only its own UUID schema and removes it afterwards. It does not load the normal application database configuration. Sixteen scenarios cover valid custom-schema definitions, a same-name table decoy, weakened CHECK, unvalidated CHECK, wrong index key/predicate/uniqueness, altered/missing exclusion, restoration, duplicate entries, missing definitions, empty manifests and unlisted rules of all three supported kinds. CI runs the suite serially after migrations and the real manifest check.

The original row-lock/deadlock experiments above remain historical evidence, not a new runtime inventory implementation. For new stock commands acquire all Product rows in ID order, then product/location locks in sorted order, then Unit rows in ID order. Helpers use the caller’s transaction; test mixed receipt/dispatch paths as well as opposite-order documents. New code follows Sunshine’s existing source-reuse rules.

Compose currently uses a floating PostgreSQL 17 image. Before generating or refreshing canonical definitions, check `SHOW server_version`; use 17.11 to match CI. A shared Compose pin is a D4 release-coordination change, not silently included in this D3 PR.
