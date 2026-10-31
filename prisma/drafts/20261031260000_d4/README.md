# D4 migration draft: 20261031260000

This directory is **not** part of `prisma/migrations`. Ordinary `db:deploy` and
CI do not apply it. It is a reviewable draft, not permission to merge PR #8.

D3 assigned slot 260000. Files moves to 255000 after the allocation-release
migration at 250000; the File branch may still contain its older folder name
while that rename is being completed. D2 states that its SQL is unchanged.
The draft depends on real `units`, `jobs`, `customers`, `users` and `files` tables.
It creates no placeholder upstream models and changes no D3 allocation writer.

## Included

- Five D4 tables/enums and real Unit/Job/customer/owner/lineage foreign keys.
- Nullable subsidy evidence FK to `files(id)`, DELETE RESTRICT / UPDATE CASCADE.
- Required occurrence timestamps, source uniqueness and one linked full signed
  reversal per cost. SQL guards reject partial/nested/wrong-job/type/early
  reversals and destructive ledger edits, deletes and truncation.
- Twenty-three CHECKs for money/quantity/text/version/date, assessed/resolved/
  confirmed tickets and paired distinct replacement lineage.
- [Canonical PostgreSQL 17.11 rules](required-constraints.json), three ledger
  triggers and two functions. The active root manifest is unchanged.

## Reproduce safely

Use a fresh, dedicated loopback PostgreSQL **17.11** test database. Set
`TEST_DATABASE_URL` explicitly to a database whose name contains `test`, and
set `DATABASE_URL` to that same test database for the migration commands.
Do not point these commands at an application/demo database. No script loads
the application `.env`, resets an existing database or invents dependency tables.

1. Run `npm run db:deploy` to apply current main's active queue.
2. Export the reviewed File PR's migration SQL into an ignored local path.
   Use the real migration from the reviewed head, not a handwritten File table.
3. Run `node scripts/stage-d4-migration-draft.mjs <file-migration.sql>`.
   It applies File then this draft only to the explicit test database, and
   writes the combined observed rules to `var/d4-draft-manifest.json` for review.
4. Build the API, then run `npm run test:d4-migration`.
5. Run `node scripts/check-db-constraints.mjs var/d4-draft-manifest.json` with
   `DATABASE_URL` still set to the same test database.
6. Run `npm run test:constraints` against that disposable database as well.

The nine database regressions use real upstream order confirmation and stock
receipt helpers for fixtures. They cover actual FK policies, cost concurrency,
semantic replay, caller rollback, signed reversals, append-only enforcement,
late-cost periods, warranty uniqueness, closure/lineage SQL backstops and atomic
rollback when a late dependency is missing. They do not certify production
authorization, D3 replacement stock, persisted historical seed or file bytes.

## Activation gate

After File #32 merges, update from main and add the actual File relation:

```prisma
// In SubsidyMilestone:
evidenceFile File? @relation("SubsidyEvidence", fields: [evidenceFileId], references: [id], onDelete: Restrict, onUpdate: Cascade)
// In D2's real File model:
subsidyEvidenceMilestones SubsidyMilestone[] @relation("SubsidyEvidence")
```

Regenerate/compare the draft against that final schema, confirm the ordered File
slot and D3 review, then move the reviewed SQL into
`prisma/migrations/20261031260000_d4/migration.sql` and merge its canonical entries
into `prisma/required-constraints.json` in the same commit. Re-run fresh migration
deployment, empty Prisma schema diff, `db:check`, checker regressions and database
tests. Never activate SQL whose schema counterpart is still missing.

D3 still owns `allocations.ticketLineId`, quote/ticket XOR and corresponding
source-validation changes, plus `Unit.replacesUnitId` and the real replacement
writer. The default replacement adapter remains unavailable until those land.
