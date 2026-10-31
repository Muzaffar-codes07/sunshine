# Four-developer ownership — current division

**One frontend developer and three backend developers.** This detailed brief follows the [owner-confirmed role division](role-division-brief.md) and [TRD sections 2 and 13](../TRD.md). It reconciles this file's earlier assignments; it does not add scope or approve new tasks. Backend owners supply shared contracts, realistic fixtures, API examples and integration support to D1.

| Developer | Role | Accountable scope |
|---|---|---|
| D1 — Nirmayi | Frontend & UI/UX | All production screens, forms, responsive behavior, API integration and device controls |
| D2 — Muzaffar | Backend: Platform, Catalogue & Sales | Auth, CRM, surveys, catalogue/packages, quotes/orders, invoices/receipts, private-file transport and shared API conventions |
| D3 — Tuhin | Backend: Inventory, Fulfillment & Field | Ledger, serials, allocation, scans, dispatch/delivery, jobs/scheduling, installation evidence/time records and migration coordination |
| D4 — Bhanu | Backend: Warranty, Service, Costs & Release | Warranty, service/replacement orchestration, cost single writer, pay/reporting/subsidy, E2E and local release |

## D1 — Frontend & UI/UX

| Responsibility | Exact scope |
|---|---|
| Mission | Deliver one connected customer lifecycle interface |
| Frontend | Every production screen, shared components/tokens, validation display, navigation, accessibility and mobile capture |
| Backend/database | Consume published APIs; no duplicated stock, money, coverage or authorization rules |
| Interfaces/directories | Typed API client and forms in `apps/web/**`; shared contract changes coordinated with D2 |
| Dependencies | D2–D4 provide schemas, realistic fixtures and error examples before their runtime routes are complete |
| Deliverables | Sales, order, warehouse, field/service and reporting views with loading/error/empty/retry states |
| Acceptance | Reads persist after refresh; unauthorized/error states are clear; actual device scan/photo/signature path is tested |
| Tests | Important forms/error states, browser lifecycle and real-device capture with domain owners |
| Independent/backup work | Build against fixtures; shared layouts and capture controls while routes are pending |
| Exclusions | No second backend, client-authoritative totals, optimistic stock or independent domain rules |

## D2 — Backend: Platform, Catalogue & Sales

| Responsibility | Exact scope |
|---|---|
| Mission | Make enquiry-to-payment and shared API foundations reliable |
| Features | Auth/roles, CRM/enquiries, surveys, Product/Manufacturer/packages, quotes/BOM snapshots, orders, invoices/receipts, file transport |
| Backend | Shared guards/errors/idempotency, catalogue facts, sales orchestration, invoice/receipt helpers, authorized file upload/download; read-only project summary |
| Database | Users/sessions; customers/enquiries/surveys; manufacturer/product/package/items; quote/order/invoice/payment; files and shared audit/commands |
| APIs | Auth, customers/enquiries/surveys, products/packages, quotes/orders, invoices/payments, files and read-only project summary |
| Directories | `platform`, `auth`, `catalog`, `sales`, `finance` invoice/receipt core, `files`; shared contract coordination |
| Dependencies | D3 `ensureJob(tx, confirmedOrder)` inside confirmation; D4 cost/reporting consumers use published DTOs |
| Deliverables | Approved survey → frozen quote/BOM → confirmed order/job/invoice → deduplicated payment; authoritative catalogue and private files |
| Acceptance | Unapproved survey cannot quote; retries do not duplicate financial effects; access and file association are checked |
| Tests | Auth/CSRF, validation, survey revision/approval gate, catalogue integrity, invoice/payment replay and private-file authorization |
| Independent/backup work | Catalogue and survey APIs, sales fixtures, shared errors and file metadata while downstream modules are pending |
| Exclusions | No ledger writes, job implementation, warranty rules, cost-entry writer or release ownership |

## D3 — Backend: Inventory, Fulfillment & Field

| Responsibility | Exact scope |
|---|---|
| Mission | Preserve equipment history and connect warehouse fulfillment to evidenced installation |
| Features | Receipts/actual cost, derived stock ledger, serials, allocation, scans, dispatch/delivery, jobs/crew, installation completion and time records |
| Backend | One ledger writer; atomic stock commands; unit traceability/returns; job helper; evidence association and completion gates |
| Database | Stock locations/documents/movements, Unit/allocation/dispatch/scan, Job/assignment and installation time/evidence associations; migration sequencing |
| APIs | Stock, units, allocations, dispatches, jobs/schedules and installation actions; exact route contracts in the architecture handoff |
| Directories | `inventory`, `fulfillment`, `field`; reviewed `prisma/` coordination |
| Dependencies | D2 catalogue/order/payment/file facts; D4 `postCost(tx, ...)` and delivery-triggered warranty activation |
| Deliverables | Receipt → reservation → scanned dispatch → delivery; scheduled job → valid evidence/time → completion |
| Acceptance | Concurrent claims have one winner; no negative stock or duplicate postings; delivery calls warranty activation once without deducting stock twice; evidence failure blocks completion |
| Tests | Real-PG concurrency/rollback/replay, serial uniqueness, insufficient stock, dispatch/delivery, job access, timestamps, evidence and overlapping labour |
| Independent/backup work | Contract fixtures, locking/integrity tests, migration reviews and device validation with D1; stack product-dependent schema only on D2's real catalogue |
| Exclusions | No catalogue/package ownership, file transport, coverage decisions, financial definitions, pay rates or separate production UI |

D3 calls D4's warranty helper in the delivery transaction; D4 owns that helper. D3 submits stock consumption and installation labour to D4's cost writer with stable unique sources. D4 orchestrates repairs/replacements using D3 stock primitives.

## D4 — Backend: Warranty, Service, Costs & Release

| Responsibility | Exact scope |
|---|---|
| Mission | Preserve after-sales coverage, reconcile business outcomes and produce a repeatable release |
| Features | Warranty activation/lookup, tickets/coverage, repair/replacement, service labour, costs/pay/reports/CSV/subsidy and local release |
| Backend | Warranty and service helpers; replacement orchestration; single cost writer; rates/pay; report queries; E2E coordination |
| Database | Warranty/policy facts, tickets/lines/coverage decisions, service time, cost entries/rates and subsidy; read other domains through agreed boundaries |
| APIs | Warranties, tickets/service actions, reports/pay and subsidy milestones; cost writer is an internal transaction-aware interface |
| Directories | `warranty`, `service`, `finance/costs`, `reporting`, `subsidy`, `compose.yaml`, `infra/` and release harness |
| Dependencies | D3 delivery/unit/stock/job/time facts and D2 billing/private files; no direct writes to another owner's tables |
| Deliverables | Explained free/chargeable repair, confirmed closure, traceable replacement, reconciled reports, seed/oracle and runnable backed-up release |
| Acceptance | Covered repair charges zero while actual costs persist; closure requires confirmation; reports reconcile; DB/files restore works |
| Tests | Warranty/calendar boundaries, cost replay/payload mismatch, replacement rollback, closure/coverage and financial reconciliation; integrated release tests |
| Independent/backup work | Pure coverage/cost rules, report fixtures, historical scenarios, demo script and submission evidence |
| Exclusions | No direct invoice/payment writer, stock mutation duplication, installation job/evidence implementation or production UI |

## Single-owner cross-cutting responsibilities

| Responsibility | Owner |
|---|---|
| Production UX, frontend routes and device controls | D1 |
| Shared API/errors/auth/contracts conventions | D2 |
| Catalogue and package/BOM templates | D2 |
| Invoice and receipt writers; private-file transport | D2 |
| Migration queue/review, stock ledger and equipment traceability | D3 |
| Jobs/scheduling, installation evidence/time and completion | D3 |
| Warranty activation and coverage helper | D4 |
| Cost-entry writer, rates/pay, reports and subsidy | D4 |
| E2E integration, seed helpers, ERD/restore evidence and local release | D4; each domain supplies valid facts |
| Demo coordination and submission package | D4; each developer supplies contribution/setup/test evidence |
| Domain tests and presentation explanation | Each domain owner; D1 explains UI |

## Integration, workload and completion rules

- The former H0 effort estimates and checkpoints are superseded. Use current estimates on the task board and the fixed gates in [TRD section 11](../TRD.md); do not treat a role table as a feasible remaining schedule.
- One owner per module. Shared exports, schema/migrations, runtime wiring and package scripts require coordination. D3 reviews migration sequencing rather than authoring everyone's schema.
- Every cross-domain helper accepts the caller's Prisma transaction, does not commit independently and avoids circular imports. D2 calls D3's job helper; D3 calls D4's cost/warranty helpers; D4 orchestrates service using D2 billing and D3 stock.
- D1 can begin with typed fixtures. Final acceptance uses real persisted APIs, with successful and rejected paths; fixtures are development aids, not implemented business behavior.
- Each PR names its exact head, interfaces, migration dependencies, tests, consumer and blocker. Authors own fixes; reviews of another owner's PR do not transfer merge ownership.
- Only Tuhin approves scope/tasks and merges or authorizes merges. All four contributors supply their own work and explain it in the demonstration.
