# Review prompt: D4 Task 2.1

Review the uncommitted implementation of D4-plan.md Task 2.1, Warranty Evaluation
Engine & Serial Lookup, in this Sunshine checkout. Read AGENTS.md, README.md,
docs/team/roles.md, D4-plan.md Task 2.1, docs/TRD.md warranty/calendar rules,
docs/architecture/api-contracts.md and apps/api/src/warranty/README.md first.
Use current files over saved memory or historical role assignments.

Review only these Task 2.1 changes:

- apps/api/src/warranty/warranty.service.ts
- apps/api/src/warranty/warranty.repository.ts
- apps/api/src/warranty/warranty-readers.ts
- apps/api/src/warranty/warranty.controller.ts
- apps/api/src/warranty/warranty.module.ts
- apps/api/src/warranty/README.md
- apps/api/src/app.module.ts (WarrantyModule registration only)
- apps/api/package.json (API test script only)
- apps/api/test/warranty.test.cjs
- packages/contracts/src/warranty.ts
- packages/contracts/test/d4.test.cjs (warranty assertions only)
- docs/architecture/api-contracts.md (Task 2.1 changes)
- this review prompt

Baseline HEAD when implementation began: 54e74a920be27dfda3619d2b3ca295f67bfa7ceb,
branch d4/task-1.1-contracts. Inspect untracked files as well as git diff. Concurrent
Task 1.3 cost-writer changes and existing .gitignore/.cursor/AGENTS.md changes are
outside this review. Do not revert, stage, commit or edit anything; report findings.

Check specifically:

1. Start-inclusive, expiry-exclusive IST calendar evaluation from occurrence
   instants. Prisma DATE values must retain their stored dates; assess exact IST
   midnight, leap-day, month-end and year boundaries. Activation/date calculation
   is D3's responsibility; this task must not extend or recalculate stored expiry.
2. Explained active, expired, not-started, void, missing-warranty and out-of-scope
   results. Verify policy revision, scope and assessment date survive validation.
   A saved component policy must not silently make all repair labour free. Exact
   requestedScope matching is deliberate; arbitrary natural-language exclusions
   are not automatically interpreted.
3. Contract changes: missing policy/dates are null together; covered work costs
   0.00; uncovered work has null charge/PENDING_ASSESSMENT until Task 3.1 provides
   assessed billable work. Flag downstream type/semantic breaks. There are no
   billable rates in this branch; do not demand fabricated prices.
4. Canonical GET /api/v1/warranties/lookup route, serial normalization preserving
   punctuation, optional manufacturer/product filters, ambiguity refusal (409),
   unknown serial (404), bounded projections, input validation and standard API
   envelopes. The plan contains a conflicting /units/lookup example; no alias is
   added. Check that no raw ORM rows or extra customer fields are disclosed.
5. Production integration gate: Unit/Job/auth and the warranty migration do not
   exist on this branch. Default access/equipment adapters must reject with 503;
   no query or header may bypass staff authorization. Prisma reader must query
   real warranty storage, retain inactive policies and report missing migration
   clearly. Determine whether any additional work is possible within Task 2.1
   before the upstream dependencies land. Do not mistake mocked adapter tests
   for real PostgreSQL/Unit/Job integration acceptance.
6. Nest wiring, useful test coverage and regressions. Production lookup remaining
   unavailable is an explicit dependency limitation, not completed end-to-end
   functionality. Ticket snapshot persistence belongs to Task 2.2; this task is
   read-only. No changes to activation, stock, billing writes or migration order.

Run npm run check when dependencies are available. Targeted commands:

```powershell
npm.cmd run build -w @sunshine/contracts
npm.cmd test -w @sunshine/api
npm.cmd test -w @sunshine/contracts
git diff --check
```

If this machine still lacks node_modules/.bin, use existing package entry points
without reinstalling dependencies or disrupting concurrent work:

```powershell
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
node --test apps/api/test/warranty.test.cjs packages/contracts/test/d4.test.cjs
```

Return actionable findings ordered by severity with file/line references,
reproduction and a proposed fix. Separate implementation bugs from known
upstream integration blockers. If no bugs are found, say so and list remaining
integration/validation gaps. Do not fix or commit in this review pass.
