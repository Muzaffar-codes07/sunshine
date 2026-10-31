# D4 migration activation — verified 1 November 2026 (IST)

Code head: `5916cf14e308255ee6364e252246e689ae41e0a5`, including main
`bd7b97e` and the merged File implementation. The earlier conditional-draft
[record](d4-coordinated-migration-verification.md) remains historical evidence;
this record supersedes its File/migration/packaging blockers.

## Activated in PR #8

- `20261031260000_d4` is in the actual migration queue after
  `20261031255000_files`. It creates the five D4 tables/enums with real restrictive
  Unit/Job/customer/owner/lineage FKs and the nullable File evidence FK using
  DELETE RESTRICT / UPDATE CASCADE.
- The actual File Prisma relation/reverse field is present. The root canonical
  manifest includes 23 D4 CHECKs, three ledger triggers and two functions.
  The duplicate draft SQL/manifest and temporary staging helper were retired;
  there is one migration source and one active canonical manifest.
- Replacement contracts/tests use `QUARANTINED` / `RESERVED`, retaining D3's
  distinct stock-location kind `QUARANTINE`. Production replacement remains
  unavailable until D3's predecessor/allocation/stock integration lands.

## Final verification

All databases were dedicated disposable PostgreSQL **17.11** instances. No
application/demo database was deployed, seeded, reset or deleted.

- Fresh `npm run db:deploy`: **18 actual migrations applied successfully**.
- Ordinary `npm run db:check`: **156 canonical rules verified**.
- Prisma database-to-schema diff: **empty**, exit 0.
- `npm run test:d4-migration`: **9 pass**, zero failures/skips. This covers real
  FK policies, concurrent replay, mismatched-payload caller rollback, exact
  linked reversals, SQL immutability/NaN/orphan guards, late-cost periods,
  concurrent warranty uniqueness, closure/lineage checks and whole-migration
  rollback after a missing late prerequisite.
- Checker regression suite: **26 scenarios pass**.
- Full `npm run check`: **203 pass** (99 API, 87 contracts, 13 seed, 4 invariant),
  zero failures/skips; docs/plan/Prisma/typechecks and production web/API builds pass.
- Complete API database suite after File/stock-read integration: **193 pass**,
  zero failures/skips. This is local explicit database evidence; ordinary CI does
  not run that suite automatically.
- Native smoke passes with both healthy PostgreSQL and the isolated unavailable
  DB case. Liveness/readiness, SPA/deep links and safe API errors are checked.
- A fresh Linux image was built from the activation code. Config digest:
  `sha256:6dec8a07f0f954a4b280552e289014a8c6daa58c684932da2943fc71a35d71cc`.
  Runtime UID **1000**, writable uploads, in-container Prisma client generation,
  explicit deployment of the 18-migration queue, and release HTTP smoke pass.
  Dedicated container/network verification was used; Compose `up --wait` itself
  was not run. The former disk/engine failure is no longer a packaging blocker.
- Both Scaffold checks and GitGuardian pass at the activation code head.

Use the [current migration guide](../architecture/d4-migration.md) to reproduce
fresh queue deployment, schema diff and database checks. Source SQL and captured
canonical function bodies retain LF line endings.

## Remaining review and runtime integration

Tuhin must review the actual migration and coordinate his
`allocations.ticketLineId` FK, quote/ticket XOR and quote-only source-trigger/
writer changes. D3 also owns `Unit.replacesUnitId` and the real replacement stock
writer. Default unavailable adapters remain in place; this migration does not
claim those workflows work in production.

D4's ticket file-access adapter, persisted equipment/report/time readers, repair
invoice integration and historical installation seed adapter remain distinct
integration work. Subsidy completion must verify bytes before the transaction,
then attach/requireEvidence inside it for the milestone's actual job. No bypass,
placeholder upstream table or independent stock/invoice writer was added.

The PR has not been merged. Green infrastructure/schema tests do not substitute
for D3's review or end-to-end production domain acceptance.
