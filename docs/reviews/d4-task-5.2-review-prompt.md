# Independent review: D4 Task 5.2

Copy the following prompt into a new agent session in this repository.

The completed Task 5.2 snapshot is currently in `var/task52-verification/`
at baseline `3a32fe2`. Another session rebased the primary checkout and stashed
the original task edits. Review this isolated worktree until those changes are
integrated; do not apply/pop another session's stashes or undo its rebase.

```text
Review D4 Task 5.2 (S11/S13: invariant acceptance tests and Docker release
verification). Work read-only: report concrete fixes; do not edit, commit, push,
reset data or apply new migrations. Follow AGENTS.md, use Auric project sunshine
with a unique session ID, and verify saved claims against current Git/files.
Start in var/task52-verification/ if these task files are absent in the primary
checkout. That detached worktree contains the final tested task snapshot. Use
its package.json and source, not the concurrent PR/rebase session's checkout.

Read README.md, D4-plan.md Task 5.2 if present (it is local/ignored),
docs/team/roles.md, docs/planning/testing.md,
docs/architecture/d4-schema-handoff.md and
docs/reviews/d4-task-5.2-release-verification.md first.

Baseline when implemented: 3a32fe24731166fa8fe1739b1f3d513286b4849d on
d4/task-1.1-contracts. Inspect current diff/untracked files, not just HEAD.
Exclude unrelated preexisting .gitignore, .cursor/ and AGENTS.md changes.
Task scope:
- tests/d4-invariants.spec.ts and tests/tsconfig.json
- package.json test/test:invariants/smoke:docker wiring
- scripts/smoke.mjs and compose.yaml app healthcheck
- README.md, docs/planning/testing.md, this prompt and release-verification.md

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

Run npm test, npm run check, git diff --check. On Windows use npm.cmd if needed.
After existing migrations and built artifacts, run npm run smoke. Inspect
docker compose ps and the recorded release evidence before creating containers.
If release rerun is possible, use README commands and npm run smoke:docker.
Do not stop unrelated processes, delete volumes or print docker compose config
(it expands secrets). If Docker/DB access is unavailable, report the exact
environment limitation rather than claiming a pass. Avoid tools that upload
private source or data. Do not add placeholder upstream schema to make a test pass.

Current branch lacks D4 Unit/Job/time integrations, real inventory/source/invoice
writers, verified staff authorization and coordinated D4 migration. Tests use
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
