# D4 Task 1.3 independent review prompt

Review the uncommitted D4 Task 1.3 implementation in the Sunshine repository.
Work on the current branch `d4/task-1.1-contracts`; the implementation baseline
is commit `54e74a920be27dfda3619d2b3ca295f67bfa7ceb`.

Read `AGENTS.md`, `README.md`, `D4-plan.md` Task 1.3, `docs/TRD.md` sections 2,
5 and 7, `docs/architecture/d4-schema-handoff.md`, the CostEntry Prisma model,
and the shared cost input schema. The user confirmed D4 Task 1.3 after referring
to a nonexistent `D3-plan.md`.

Review these changes, including new untracked files:

- `apps/api/src/finance/cost-writer.service.ts`
- `apps/api/src/finance/finance.module.ts`
- `apps/api/src/finance/README.md`
- `apps/api/src/app.module.ts`
- `apps/api/test/cost-writer.test.cjs`
- `apps/api/package.json` and the root `package.json` test scripts

Concurrent warranty work also appears in this workspace. Review only the
FinanceModule registration in `app.module.ts`; preserve WarrantyModule and
other warranty/contract changes. The API unit-test script is shared by both
tasks. Do not attribute unrelated warranty changes to Task 1.3.

Check that `postCost` uses only the supplied caller transaction, returns a
Prisma CostEntry, and deduplicates `(uniqueSourceId, costType)` without updating
the original row. Assess the PostgreSQL behavior of `createMany` with
`skipDuplicates: true` followed by `findUniqueOrThrow`, including concurrent
transactions, isolation levels, error propagation and caller-owned retries.
Check exact decimal handling, runtime input validation, Nest module exports,
test quality and integration boundaries.

Task 1.3 explicitly returns the existing compound-key row on duplicate input;
the implementation documents that its original payload wins. Outer command
payload-conflict enforcement is separate. The existing compound key permits a
source under different cost types; distinguish that inherited schema decision
from implementation regressions.

The CostEntry model is not migrated and the upstream Job relation/SQL checks
are deferred under the existing schema handoff. Do not deploy, push the schema
or add placeholder tables. Unit tests use a transaction double; passing them
does not establish real PostgreSQL concurrency or rollback behavior.

Run `npm.cmd run check` and `git diff --check` if dependencies are available.
Report any environment blockers precisely. Do not edit files, commit or push.
Preserve unrelated `.gitignore`, `.cursor/` and `AGENTS.md` changes.

Return findings in severity order with file/line references, a concrete failure
scenario and a suggested fix. Separate actual defects from inherited migration
dependencies and optional improvements. If there are no blockers, say so and
state which checks passed and what remains unverified.
