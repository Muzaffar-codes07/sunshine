# Independent review: D4 Task 5.2

Copy the following prompt into a new agent session in this repository.

```text
Review D4 Task 5.2 (S11/S13: invariant acceptance tests and Docker release
verification). Work read-only: report concrete fixes; do not edit, commit, push,
reset data or apply new migrations. Follow AGENTS.md, use Auric project sunshine
with a unique session ID, and verify saved claims against current Git/files.

Read README.md, D4-plan.md Task 5.2 if present (it is local/ignored),
docs/team/roles.md, docs/planning/testing.md,
docs/architecture/d4-schema-handoff.md and
docs/reviews/d4-task-5.2-release-verification.md first.

Integrated baseline: c2166b458d0c6ab26906dac98bf78e1da93cb257 on
d4/task-1.1-contracts. The original snapshot at 3a32fe2 was reviewed with no
actionable defects. Review the integrated primary checkout; the earlier isolated
var/task52-verification worktree is historical. Inspect the task commit/diff
against this integrated baseline as well as any current uncommitted changes.
Exclude unrelated preexisting .gitignore, .cursor/ and AGENTS.md changes.
Task scope:
- tests/d4-invariants.spec.ts and tests/tsconfig.json
- package.json test/test:invariants/smoke:docker wiring
- scripts/smoke.mjs, compose.yaml app healthcheck and infra/Dockerfile ownership
- README.md, docs/planning/testing.md, this prompt and release-verification.md
- Separate integrated build fix: apps/web/src/app/App.tsx restores its truncated
  tail and removes the dangling PublicEnquiryPage import/route (component absent
  from Git). CapabilitySpikePage.tsx uses native labeled inputs because its Field
  import was also absent. Keep / and the DEV-only /spike route working; adding
  the real enquiry frontend remains D1 work once its source lands.

Preserve rebased db:check/test:constraints scripts and Compose SESSION_SECRET,
AUTH_TRUSTED_ORIGINS, SESSION_COOKIE_SECURE and TRUST_PROXY settings. Root
typecheck must also include the new invariant suite. Do not replace newer files
wholesale with the original isolated snapshot.

Trace tests into the REAL services, contracts and current migrations:
WarrantyService, ServiceService/controller, RepairBillingService,
CostWriterService, ReplacementService and ReportingService. Check the following:

1. Test discovery: npm test and npm run check really execute all four new tests.
   The focused command needs built API/contracts; typings match runtime imports.
   No newly skipped tests, no reliance on stale dist, portable Node >=22.12,
   and API dependencies resolve both when nested and in a clean npm ci layout.
2. Warranty/billing: exclusive expiry at 2026-01-01 IST, milliseconds on either
   side (2025-12-31T18:29:59.999Z / T18:30:00Z). Use the real engine and persisted
   test assessment, not a hardcoded coverage flag. Covered has zero selling
   price/no invoice; expired has 16800.00 pre-tax charge, one invoice. Both
   retain 14600.00 actual costs on the original job. Replay neither double-posts
   cost nor duplicates the allocation PART line. Later policy changes do not
   change the saved assessment used for billing.
3. Ledger/report: same (uniqueSourceId,costType) returns same cost ID and one
   row. Covered repair reconciles 55000 revenue/receipts, 40000 material,
   2400 installation labour, 14000 parts, 600 service labour: 57000 cost,
   -2000 contribution and zero outstanding. No ticket-total duplicate expense.
4. Replacement: actual orchestrator calls stock/billing with the same tx,
   validates QUARANTINE/ALLOCATED and predecessor, saves old/new ticket IDs,
   keeps original start/expiry/policy/scope/active/duration and replays once.
   Distinguish assertions about the adapter contract from proof of actual D3
   stock mutation; stock is a test double, not production PostgreSQL evidence.
5. Confirmation: real Nest controller/guard/filter HTTP request, each missing
   name/channel/time returns standard 400 and leaves facts/version unchanged.
   Valid payload closes and repeated confirmation returns 409. Test-only access
   provider must never enter production wiring. Existing auth gates must remain.
6. Smoke: no-argument mode starts/stops only its temporary child APIs, checks
   healthy DB and sanitized unavailable-DB 503 with liveness still 200.
   --base-url mode contacts the existing HTTP release, requires no DB URL,
   starts/stops no API/container and clearly excludes offline DB testing.
   Validate CLI inputs, request timeouts, draining stdout/stderr, startup error
   and early-exit cleanup. Never print .env, credentials or connection URLs.
7. Compose: healthcheck works with Node fetch as USER node, uses DB readiness,
   timeout/retry/start-period are valid, app/DB remain loopback-only and volume
   persistence intact. No seed/reset/migrate on startup. Verify actual image
   build, explicit existing migration deployment, --wait health and HTTP smoke;
   native smoke alone is not Docker release verification.
   Dockerfile creates /app with node ownership and runs dependency install/build
   as node, using COPY --chown for manifests/source. This replaces the former
   recursive chown layer, which exhausted disk space during integrated release
   validation. Verify builds and uploads/CLI write permissions as the same user;
   no image cache cleanup may delete databases or upload volumes.

Run npm test, npm run check, git diff --check. On Windows use npm.cmd if needed.
After existing migrations and built artifacts, run npm run smoke. Inspect
docker compose ps and the recorded release evidence before creating containers.
If release rerun is possible, use README commands and npm run smoke:docker.
Do not stop unrelated processes, delete volumes or print docker compose config
(it expands secrets). If Docker/DB access is unavailable, report the exact
environment limitation rather than claiming a pass. Avoid tools that upload
private source or data. Do not add placeholder upstream schema to make a test pass.

Current branch lacks D4 Unit/Job/time integrations, real inventory/source/invoice
writers, D4 authorization adapters and coordinated D4 migration. Platform staff
sessions exist; their presence does not wire authorization into the D4 ports. Tests use
doubles at those explicit boundaries; Docker smoke verifies the runnable
infrastructure, not live D4 business acceptance. Treat these documented upstream
dependencies separately from defects introduced by this patch. Verify whether
the current files still support those limitations; do not copy stale evidence.

For each actionable defect report:
- [P0/P1/P2/P3] short title
- exact path:line (smallest relevant location)
- concrete trigger and reproducible command/request or minimal failing test
- expected versus observed behavior and practical impact
- minimal fix with the precise file/function to change
- regression assertion that fails before and passes after the fix

Order findings by severity. Do not invent issues to fill a quota, report style
preferences as bugs, or call a known missing upstream adapter a new regression.
If none are found, say No actionable defects found, list checks actually run,
and describe remaining integration/release risks. Finish with a concise ordered
fix list so the implementation agent can act without guessing. Separate any
unverified claims or environment blockers from reproduced findings.
```
