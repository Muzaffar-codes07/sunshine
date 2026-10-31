# Independent review: D4 Task 5.1

Copy the following into the reviewing agent's thread:

```text
Review D4-plan.md Task 5.1 / S12 (Historical Demo Scenarios Seed Data) in
C:\Users\BHANU TEJA GUPTA V\Downloads\Projects\sunshine.
Perform an independent, read-only review. Do not edit files, commit, push or
reset/reseed an existing database. Follow AGENTS.md and Auric continuity; verify
saved state against Git/files. Preserve unrelated .gitignore, .cursor/ and
AGENTS.md changes. No subagents are required.

Read README.md, docs/team/roles.md, the Task 5.1 acceptance criteria,
docs/architecture/data-model.md, docs/architecture/d4-schema-handoff.md and
prisma/seed/README.md. Inspect the whole new/untracked files as well as git diff.
Baseline before this task was 14d5a91cbf998b807ab2b36595513b6e1279c2bf;
if changes are committed, compare the task commit(s) rather than assuming the
working tree diff contains everything. Do not review unrelated earlier features.

Scope:
- prisma/seed/d4-demo-scenarios.ts
- prisma/seed.ts and prisma/tsconfig.json
- prisma/seed/test/d4-demo-scenarios.test.cjs
- prisma.config.ts (explicit Prisma seed hook)
- package.json (seed build/run/tests/typecheck integration)
- prisma/seed/README.md, README.md and local D4-plan Task 5.1 status
- docs/reviews/d4-task-5.1-review-prompt.md

Known boundary: Job/Unit/Order/Dispatch models and the coordinated D4 migration
are absent on this branch. The installation writer is an explicit required
integration port, undefined in the CLI. Normal seeding must fail BEFORE any
connection/write; preview must be connection-free. Persisted demo acceptance is
pending and must not be reported as complete. Treat missing upstream adapters,
migration and real-PostgreSQL acceptance as integration blockers separately
from new implementation defects. Do not propose fake Unit/Job tables, dangling
UUIDs, fixture-backed production readers, destructive resets or auth bypasses.

Probe these risks with concrete inputs, traces or a minimal reproduction:
1. Exact scenarios: Anita Sharma, 3 kW ON_GRID, serial INV-ACTIVE-2025-01,
   18-month age, 24-month component coverage, OPEN ERR-04: Ground fault ticket;
   Rajesh Verma, 5 kW battery-equipped system, BAT-EXPIRED-2024-09, 28-month
   age, expired 24-month component coverage, OPEN chargeable-assessment ticket.
   The Verma OFF_GRID type is an explicit assumption. No invoice/assessment or
   arbitrary repair charge should be fabricated. Coverage doesn't imply labour
   scope or supplier recovery. Check against real WarrantyService semantics.
2. Dates: one reference instant, IST civil date independent of host timezone,
   18/28 calendar months, clamped month ends and leap days, exclusive expiry,
   SQL DATE encoded as UTC midnight. At 2026-10-31 IST expect installation/expiry
   2025-04-30/2027-04-30 and 2024-06-30/2026-06-30. Probe IST midnight crossing,
   invalid dates, Feb29, years 0000-0099, fractional/nonfinite month offsets,
   four-digit year overflow/underflow, and later-month reruns. Dates must never be inferred from
   the fixed serial suffix. Explain any true mismatch with requirements.
3. Stable UUIDs/keys; repeat seeding must not duplicate rows, reset OPEN/CLOSED
   states, void flags, versions, resolution/confirmation, assessments, billing,
   replacement lineage or original installation/warranty dates. Changed customer
   identity/policy/ownership must conflict safely. The upstream writer must return
   original persisted dates and validate genuine historical delivery/completion,
   even after replacement. Identify guarantees that depend on that future writer.
4. Existing phone, serial, ticket number, unit warranty and deterministic ID
   collisions must never adopt or overwrite unrelated records. Returned job/unit/
   customer/product/capacity/type/serial/dates must be checked appropriately.
   Tests with state doubles aren't evidence that real FKs and constraints exist.
5. Same caller transaction reaches all customer/warranty/ticket and upstream
   writes, both scenarios commit together; late failures propagate and abort.
   Check advisory-lock SQL, Serializable interleavings, timeout, constraint/error
   behavior, and that seed/app concurrency isn't overstated. No nested commit or
   swallowed error. Separate PostgreSQL proof from behavior of the state double.
6. Default CLI must exit nonzero with D4_SEED_INTEGRATION_REQUIRED and do zero
   writes; --preview returns persisted:false, both scenarios and no credentials.
   Unknown args fail. Check clean-checkout generation/compilation, module imports,
   disconnect/error behavior, npm run db:seed -- --preview and Prisma seed wiring.
   db:deploy/start must not seed/reset anything. Database URLs/secrets must never
   be logged. Typecheck and normal tests must include seed code/regressions.
7. Documentation accurately distinguishes implemented seed preparation from
   runnable persisted acceptance. Integration needs real completed-job evidence,
   inventory/order/delivery facts, source costs, D4 migration/FKs, verified lookup
   access/readers and official repair invoicing/report reconciliation. No tests
   may hide missing integration or claim live lookup acceptance from doubles.

Run npm.cmd run test:seed and npm.cmd run check plus git diff --check when
possible. Do not run a seed against an existing database. Only perform real
database mutation if a disposable database and applicable explicit authorization
are available; otherwise report the precise acceptance checks not performed.

Output:
- Findings first, ordered P0/P1/P2/P3. For every defect give path:line,
  concrete trigger/reproduction, expected vs actual behavior, impact, exact
  minimal fix (a suggested diff when useful), and regression to add/run.
- Separate known upstream integration blockers from defects in this patch.
- State commands/results and what remains unverified. Assess whether Task 5.1
  is fully accepted or only prepared pending integration, with evidence.
- If no actionable patch defects are found, say so. Do not invent findings or
  suggest broad refactors without a reproducible correctness issue.
```
