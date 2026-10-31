# D4 coordinated migration preparation — verified 31 October 2026

Historical preparation snapshot. Files subsequently merged and the D4 migration
was activated and revalidated; use the
[activation record](d4-coordinated-migration-activation.md) for current status.

Code head: `fee3c027457caa52eb9f1d9ea8ba3cc532ab18f4`, including main
`4084e36a9585d4e5b7d1d6286c8604d1e251a45e`. Preparation commit: `3dfd422`.
This record does not approve PR #8 for merge or activate the D4 migration.

## Changes

The branch retains current sales, quote/order/invoice, inventory, allocation,
job and scheduling modules alongside D4 modules. Real Unit/Job Restrict relations
replace D4's corresponding scalar-only references. Replacement result contracts,
fixtures and assertions use `QUARANTINED` and `RESERVED`; negative regressions
reject the old `QUARANTINE` / `ALLOCATED` unit-result literals. The separate D3
stock-location kind `QUARANTINE` remains unchanged.

The former 260000 draft (now the [active migration](../../prisma/migrations/20261031260000_d4/migration.sql)) contains five
D4 tables/enums, the confirmed evidence-file FK, 23 CHECKs, three immutable-cost/
reversal triggers and two functions. Its canonical PostgreSQL 17.11 definitions
are kept beside the draft. Neither the active queue nor its manifest includes
these draft objects yet.

## Verified

- `npm run check`: exit 0; docs/plan/Prisma/typechecks, **99 API + 86 contract +
  13 seed + 4 invariant tests = 202**, no failures/skips, production web/API builds.
- Two fresh isolated PostgreSQL **17.11** database replays: initial main queue,
  then updated main's **16 active migrations**, followed by the actual reviewed
  pending File SQL and the D4 draft. No application database or volume was used.
  The File SQL was exported from `87d232a` at its then-current 190000 folder;
  D2 subsequently confirmed unchanged SQL and assigned its final slot 255000.
- Combined main/File/draft canonical checker: **156 rules** verified, including
  the D4 rules recorded in the draft. Checker regressions: **26 scenarios pass**.
- `npm run test:d4-migration`: **9 real PostgreSQL tests pass**. Coverage includes
  actual FK targets/delete/update actions, concurrent same-source replay,
  conflicting payloads, semantic Decimal/time equality, rollback of preceding
  caller writes, exact linked reversal replay, SQL immutability/NaN/orphan guards,
  late-cost periods, concurrent warranty uniqueness, confirmation/lineage checks
  and atomic rollback of the entire migration after a missing late prerequisite.
- `npm run test:db -w @sunshine/api`: **168 pass, zero failures/skips** on the
  isolated replay database, including the integrated upstream domain suites.
- Native smoke: healthy PostgreSQL/readiness/liveness, SPA/deep links and safe
  API errors pass; the isolated unavailable-DB case returns sanitized 503.
- Fresh Linux image build passes from this code head. Image config digest:
  `sha256:9047bdcfaa1f3f0e0a905edf8ad6f4fcbca1da599815193060510dc23bd57bac`.
  Runtime UID is **1000**, uploads are writable, and in-container Prisma client
  generation plus explicit active-queue deployment pass. HTTP release smoke
  passes against the isolated database. This verifies the corrected Docker
  ownership sequence after the earlier disk/engine failure; no old image was
  reused as evidence for the current code. Compose `up --wait` was not run;
  this verification used a dedicated container/network and loopback API port.
- Both GitHub Scaffold checks and GitGuardian pass at the code head. GitHub now
  reports MERGEABLE; the earlier contradictory conflict result is no longer the
  current observation.

## Remaining gates

Files #32 is still open. D2's comment 6547220769 moves its migration to
`20261031255000_files`; D4 remains at `20261031260000`. After Files merges, update
from main, add the real Prisma File relation/reverse field, regenerate/compare
the SQL, activate the reviewed migration and manifest together, and prove an
empty final Prisma schema diff plus ordinary queue/constraint checks.

Request 6547139166 tags Tuhin and Muzaffar. D3 owns `allocations.ticketLineId`,
its FK and quote/ticket XOR, plus adapting the existing quote-only source trigger
and allocation writer. Merely adding a nullable column cannot enable repair
allocations. D3 also owns `Unit.replacesUnitId` and the production replacement
stock writer. Those adapters remain unavailable in this branch.

The tests above do not certify production authorization, full physical repair/
replacement stock behavior, real service invoicing integration, subsidy evidence
bytes or persisted historical demo seeding. D2's download-before-transaction and
attach/requireEvidence-inside-transaction contract remains the required evidence
integration. D3 must re-check the final migration before merge.
