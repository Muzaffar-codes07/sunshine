# D4 coordinated migration: 20261031260000

Files #32 has merged with `20261031255000_files`. The D4 migration now lives in
the active queue at
[`20261031260000_d4/migration.sql`](../../prisma/migrations/20261031260000_d4/migration.sql),
with the actual File Prisma relation/reverse field and canonical rules registered
in [`required-constraints.json`](../../prisma/required-constraints.json).
Its former conditional draft and staging helper have been retired. This does
not authorize merging PR #8 or enable missing production adapters.

## Integrity

The migration creates five D4 tables/enums. It uses restrictive real Unit/Job,
customer/owner and replacement-lineage FKs; subsidy evidence references `files(id)`
with DELETE RESTRICT / UPDATE CASCADE. Twenty-three CHECKs protect decimal money,
quantities, required text, versions, dates, assessment/resolution/confirmation and
paired distinct replacement links. Three triggers and two functions enforce
append-only cost entries and exact, non-nested, same-job/type full reversals.

## Reproduce on a disposable PostgreSQL 17.11 database

Set `TEST_DATABASE_URL` explicitly to a dedicated loopback database whose name
contains `test`, and set `DATABASE_URL` to that same database for migration/check
commands. No test loads the application `.env` or resets application data.

1. Run `npm run db:deploy` on a fresh test database.
2. Run `npm run db:check` and `npm run test:constraints`.
3. Run `npm run build`, then `npm run test:d4-migration` and
   `npm run test:db -w @sunshine/api`.
4. Run `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`.
   The deployed tables, FKs, columns and indexes must match the actual schema;
   the ordinary checker independently verifies custom SQL rules.
5. Run `npm run check` and healthy/offline/release smoke against isolated test
   infrastructure. Apply no seed automatically.

The nine D4 database tests use real upstream order confirmation and stock receipt
helpers. They cover FK policies, concurrent replay, mismatched-payload rollback,
linked reversals, SQL immutability/NaN/orphan guards, late-cost periods, concurrent
warranty uniqueness, closure/lineage backstops and whole-migration atomicity after
a missing prerequisite. They do not certify production auth, physical replacement,
file bytes, service invoices or persisted historical seed acceptance.

## Remaining owner integration

D3 owns `allocations.ticketLineId`, its FK, quote/ticket XOR and corresponding
source-trigger/writer changes. D3 also owns `Unit.replacesUnitId` and the actual
replacement writer. The default replacement adapter remains unavailable until
those land; no placeholder field or duplicate stock writer is added here.

Subsidy completion must use D2's download-before-transaction, then attach and
requireEvidence inside the same transaction for the milestone's JOB. The
read-only subsidy report does not implement completion. D4's ticket file-access
adapter and the other production integration ports remain explicit follow-ups.

D3 must review the final migration and its coordination before PR #8 merges.
