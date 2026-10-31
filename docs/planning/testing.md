# Validation and acceptance

## Implemented scaffold checks

`npm run check`: documentation/source-copy references, Prisma validation, TypeScript checks, shared contract tests and frontend/backend production builds. Runtime smoke: liveness, readiness with/without DB, initial migration and SPA fallback. CI builds a clean install and applies the migration to PostgreSQL.

These checks do **not** validate business logic that has not been implemented. Authentication, stock safety, money and coverage remain future work.

## Domain testing plan

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
