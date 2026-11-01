# Demo seed ownership and D4 historical scenarios

**450-customer dataset:** use [the bulk seed guide](DEMO450.md) and
`npm run db:seed:demo`. Its offline historical importer is separate from the
legacy two-scenario seam described below. The legacy default `db:seed` still
fails closed; its preview remains available.

D3 coordinates idempotent seed functions from each backend owner. Never reset
on startup or seed an ordinary database implicitly.

- Staff: npm run seed:staff -w @sunshine/api requires explicit
  DEMO_DATABASE_DISPOSABLE=true and DEMO_STAFF_PASSWORD.
- Catalogue (D2): npm run seed:catalogue -w @sunshine/api requires explicit
  DEMO_DATABASE_DISPOSABLE=true. It inserts missing fictional products and
  complete package revisions without rewriting existing prices or BOMs.

Build before running these commands. The catalogue seed adds no stock, warranty,
invoice, payment, or historical installation. The separately historical
18-month demonstration installation remains the responsibility of the
business workflow seed.

See [catalogue handoff](../../docs/architecture/catalogue-handoff.md).

D3 coordinates seed integration and migrations. Task 5.1's scenario manifest,
transactional seed helper, CLI wiring and isolated regressions are implemented.
**Persisted demo acceptance remains blocked:** real Job/Unit/Order/allocation
models and the coordinated D4 migration are now present, but the completed
historical installation/evidence/time/dispatch and finance source adapter is
still missing. The main seed exits with `D4_SEED_INTEGRATION_REQUIRED` before creating a client,
connecting or writing anything. It does not leave tickets/warranties pointing at
invented Job/Unit UUIDs. This is preparation for integration, not a runnable
persisted lifecycle demo. Existing production API integration gates remain.

## Commands

```bash
npm run db:seed -- --preview
npm run test:seed
# After the upstream writer and coordinated migration are integrated:
npm run db:seed
# Prisma's explicit seed command delegates to the same script:
npx prisma db seed
```

Preview prints synthetic scenarios with `persisted: false` and needs no database.
`db:seed` generates Prisma and compiles `prisma/seed.ts` before running it.
`npm run check` includes seed typechecking and tests. Tests use transaction
doubles; they do not prove real database rollback, concurrency or lookup access.
`db:deploy` still applies migrations only. There is no startup reseed, reset,
delete, `db push`, automatic migration or credential output.

## Scenarios and dates

- **Anita Sharma:** 3 kW on-grid, inverter `INV-ACTIVE-2025-01`, installation
  18 calendar months before the first seed's IST date, 24-month component policy,
  OPEN ticket with `ERR-04: Ground fault` and rainy-season breakdown context.
- **Rajesh Verma:** 5 kW off-grid (battery-equipped), battery
  `BAT-EXPIRED-2024-09`, installation 28 calendar months before the first seed,
  24-month component policy, OPEN ticket ready for chargeable repair assessment.

Names follow the task; phone numbers/addresses are synthetic demo placeholders,
email uses `example.invalid`. Do not call/message these contacts. The system type
for the battery example is an explicit seed assumption, not a product rule.
Serial suffixes are fixed identifiers, not parsed dates. At a reference instant
on **2026-10-31 IST**, installation/expiry are **2025-04-30 / 2027-04-30** and
**2024-06-30 / 2026-06-30** respectively. Month shifts clamp invalid days to
month end, including leap days. The month helper preserves years 0000-0099,
requires integer month offsets, and rejects shifts outside the four-digit year
range with `D4_SEED_INVALID_DATE`. SQL DATE encodings use UTC midnight; the civil
dates represent IST and coverage remains `[startDate, expiryDate)`.

`buildD4Scenarios(now?)` is pure; `seedD4Scenarios(prisma, { installations, now? })`
uses a single clock instant. Each scenario has stable customer/job/unit/warranty/
ticket UUIDs and a unique demo ticket number. Customers upsert by ID, warranties
by unitId, tickets by ID, all with empty update objects. Identity/policy conflicts
throw rather than overwriting other records. Phone/serial/ticket-number collisions
must fail, never adopt unrelated records. The installation writer returns the
original persisted delivery/installation date on repeat runs; coverage never
slides forward. Existing ticket status, resolution, confirmation, billing and
replacement snapshots, and warranty active/void state are preserved. Customer
identity edits conflict and require explicit review; seed does not repair them.
If a demo has aged out of coverage, repeat seeding keeps its real history. Use a
fresh disposable demo database to rehearse relative-age examples again.

Both tickets are OPEN and unassessed: assessment and official service billing
must run through the existing workflow. No fake invoice, receipt, charge amount,
saved assessment, replacement or repair ledger is seeded. Component coverage
does not silently promise free unrelated labour or supplier reimbursement.

## Integration contract and remaining acceptance

Implement `D4DemoInstallationWriter.ensureInstallation(tx, input)` against the
actual upstream schema, then replace the explicitly undefined `installations`
seam in `prisma/seed.ts`. The current default is deliberately unavailable.

1. Coordinate the D4 migration described in the [schema handoff](../../docs/architecture/d4-schema-handoff.md),
   including real Unit/Job Restrict FKs and all integrity checks. Never create
   placeholder tables, scalar-only references or a fixture-backed lookup adapter.
2. In the **supplied transaction only**, seed/verify the historical sales/order,
   product, completed job with evidence, serialized unit, actual stock receipt,
   allocation, dispatch and delivery. Persist all required domain facts with
   stable seed identities and marked synthetic evidence. Existing IDs/serials
   belonging to another customer/job/product must reject, not be reassigned.
   Inventory and finance owners supply legitimate movements/cost sources and
   frozen amounts; do not duplicate receipt/consumption expense or invent totals.
3. Return the exact requested installation identity, original IST delivery date,
   and verified historical completion/delivery flags. D4 writes its 24-month
   demo warranty in the same transaction; do not independently activate or extend
   it. The adapter must preserve original dates on reruns, including after unit
   quarantine/replacement. Derive flags from historical events, not live status.
   Two demo installs assume delivery and installation occurred on the same date.
4. The helper takes a PostgreSQL transaction advisory lock, uses Serializable
   isolation and commits both scenarios atomically. Propagate any error so the
   transaction aborts. Serialization/deadlock failures may require rerunning the
   entire explicit seed; there are no unsafe partial retries or independent commits.
   The seed lock alone does not lock normal application writers.
5. On disposable migrated PostgreSQL, run twice and compare counts, IDs, dates,
   snapshots and source ledgers; run after a progressed/closed/replaced ticket;
   probe unrelated phone/serial/ticket-number collisions and competing seed/app
   writes. Force late second-scenario failure and verify zero partial writes.
6. Wire verified staff access and real equipment/report/billing readers. Look up
   both exact serials through `/api/v1/warranties/lookup`, assess covered vs expired
   through the real engine, and demonstrate zero covered customer charge vs
   chargeable parts/labour using D2's official invoice helper. Reconcile job
   revenue/cash/cost reports. Until then, instant live lookup and chargeable demo
   invoicing are **not** accepted by this task's isolated tests.

See the [independent review prompt](../../docs/reviews/d4-task-5.1-review-prompt.md)
and [ownership](../../docs/team/roles.md).
