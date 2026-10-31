# Validation and acceptance

## Implemented scaffold checks

`npm run check`: documentation/source-copy references, Prisma validation, TypeScript checks, shared contract tests and frontend/backend production builds. Runtime smoke: liveness, readiness with/without DB, initial migration and SPA fallback. CI builds a clean install and applies the migration to PostgreSQL.

These checks do **not** validate business logic that has not been implemented.
Staff-session security and D4 service rules have automated tests; physical stock
safety and live D4 database integration still require their upstream workflows.

## D4 invariant and release verification (Task 5.2)

`npm test` builds the API/contracts and runs the existing focused suites plus
[`tests/d4-invariants.spec.ts`](../../tests/d4-invariants.spec.ts). The latter is
typechecked and run with Node 22's explicit `--experimental-strip-types` flag.
After `npm run build`, `npm run test:invariants` runs it independently. Rebuild
the API after source changes before using that focused command; `npm test` and
`npm run check` build it automatically. Root `npm run typecheck` also checks the
invariant suite.

The suite composes the real warranty engine, ticket lifecycle, repair billing,
cost writer, replacement orchestrator and profitability engine. It verifies:

- The millisecond before exclusive IST expiry is covered; exact midnight is
  expired. The saved assessment drives zero customer price versus a 16800.00
  pre-tax parts/labour invoice, with 14600.00 internal cost in both cases.
- Reposting one source returns one cost ID. A covered repair reduces the
  synthetic job's contribution from 12600.00 to -2000.00 without a receivable.
- An 18-month replacement retains the original 24-month policy interval and
  old/new lineage. Replay creates no second stock operation, warranty or billing.
- Actual Nest HTTP confirmation rejects each missing name/channel/time with
  400 and leaves the row unchanged. Valid confirmation closes; replay conflicts.

All storage, inventory, source and invoice adapters in this suite are test-only
doubles. Quarantine/assignment assertions verify the orchestration boundary;
they do not prove D3's physical stock writer. No placeholder models, production
authorization bypass, D4 migration or persisted demo seed is introduced.
Real D4 PostgreSQL constraint/concurrency/rollback and authenticated lifecycle
acceptance remain pending Unit/Job/time/source/invoice adapters and the
[coordinated migration](../architecture/d4-schema-handoff.md).

For infrastructure release verification, use the root README commands: start
PostgreSQL with `docker compose up -d --wait db`, build, explicitly apply existing
migrations, and run `npm run smoke`. Build the Compose image, apply migrations
with `docker compose --profile app run --rm app npm run db:deploy`, start with
`docker compose --profile app up -d --wait app`, then `npm run smoke:docker`.
The app healthcheck uses real DB readiness. Docker smoke targets the running
HTTP release; native smoke separately launches temporary APIs to test both
healthy PostgreSQL and an isolated unavailable local port. Neither smoke mode
seeds or resets data. Stop the app container before native development on 3001.

See the [Task 5.2 review prompt](../reviews/d4-task-5.2-review-prompt.md) for
independent checks and required actionable finding format.

`npm run check:plan` separately checks the [backlog](build-backlog.json), [traceability](requirements-traceability.csv) and [oracle](demo-seed-oracle.json): exactly four owners, one dedicated frontend owner, hour budgets, no dependency cycles, all R1–R25 rows and worked financial arithmetic. Passing it does not mean the database returns those figures or that the demo fits three minutes.

## Domain testing plan

`npm run test:d4-migration` is an explicit opt-in PostgreSQL 17.11 suite for the
[coordinated D4 migration](../architecture/d4-migration.md). Its nine tests use a
dedicated loopback test database with the actual active migration queue. They verify FK policies,
concurrent cost/reversal replay, payload-conflict rollback, ledger immutability,
period cutoffs, lifecycle SQL checks and migration atomicity. The migration now
runs through `db:deploy`; these opt-in database tests do not establish full production
replacement, file authorization or persisted seed acceptance.

Use backend Jest/Supertest familiarity, real local PostgreSQL integration tests for concurrency, Vitest/Testing Library for important forms, and one-browser Playwright for the connected lifecycle. Pin compatible versions. Avoid a large browser matrix or tests mirroring simple component markup.

| Behavior | Required result | Owner |
|---|---|---|
| Invalid contact/survey | Field error and no write | D2 |
| Quote before approval / incomplete BOM | Rejected with no partial state | D2/D3 |
| Duplicate normalized serial | DB rejects duplicate | D3 |
| Insufficient stock | Whole allocation rolls back | D3 |
| Two allocations for same inverter | One succeeds, one conflicts | D3 |
| Receipt/payment retry | One posted payment and correct balance | D2 |
| Repeated dispatch/delivery | One movement/cost; unchanged warranty dates | D3 |
| Invalid/boundary/expired warranty | Explicit correct decision | D3/D4 |
| Missing time/size/photo/signature | Installation cannot complete | D4 |
| Unauthorized job/file | Access rejected | D2/D4 |
| Replacement | Old/new linkage and stock/cost consistent | D3/D4 |
| Customer confirmation absent | Ticket remains awaiting confirmation | D4 |
| Negative money / doubled source | Rejected or explicit reversal | D2 |
| Reports | Match posted invoices/costs/payments | D4 |
| Network failure after commit | Idempotent retry finds saved result | Each owner |
| DB failure / restart | No fake success; persistence survives restart | D2 |

## Future demo seed acceptance

Fifteen technicians, representative roles, 1–5 kW on/off-grid packages, complete components, available and allocated serials, actual stock receipt costs, new enquiry, an 18-month historical installation, expired inverter, partial payments, repair costs, subsidy milestones, profitable and loss-making jobs. No real personal data. Seed is explicit and idempotent; never run a reset on normal startup.
