# Four-developer ownership — current decision

**Exactly one dedicated frontend developer and three backend developers.** This replaces all earlier vertical/full-stack and two-frontend proposals. All backend developers supply contracts and realistic fixtures early so the frontend owner can work without waiting.

| Developer | Role | Backend/domain ownership |
|---|---|---|
| **D1** | Frontend & UI/UX | All screens, components, forms, responsive behavior, API integration |
| **D2** | Backend: Platform, Sales & Finance | Auth, CRM, survey, quote, order, invoices, payments, cost-writing service, files, subsidy milestones, deployment |
| **D3** | Backend: Inventory, Fulfillment & Database | Catalogue, package/BOM templates, receipts, stock, serials, allocation, scanning, dispatch, delivery, warranty activation, migration coordination |
| **D4** | Backend: Installation, Service & Reporting | Jobs, assignments, evidence association, signatures, timesheets, tickets, coverage decisions, replacement orchestration, reports, pay summary, CSV |

## D1 — Frontend & UI/UX

| Responsibility | Exact scope |
|---|---|
| Mission | Deliver one coherent customer lifecycle interface |
| Features | Overview, Sales, Orders, Warehouse, Field & Service, Reports |
| Frontend | Every production UI change, six page patterns, shared tokens, accessibility, mobile interactions |
| Backend | None; business rules and financial totals come from APIs |
| Database | Review response and display needs; no migration ownership |
| Interfaces | Typed API client, error mapping, shared form/status contracts |
| Directories | `apps/web/src/**` |
| Dependencies | Each backend owner provides shared schemas, fixtures and error examples by H1.5 |
| Deliverables | Connected screens, scan/upload/signature controls, loading/error/empty states |
| Acceptance | Full lifecycle reads persisted APIs; refresh retains data; phone interactions tested |
| Effort | 16–17 focused hours within 24 elapsed hours |
| Checkpoints | H6 shell/intake/device spike; H13 sales; H19 fulfillment; H20.75 whole lifecycle; H22 timed presentation |
| Tests | Important form validation, error handling and UI states; support domain E2E scenarios |
| Independent work | Build against typed fixtures; risky scan/signature/photo controls first |
| Backup tasks | Finish reusable states and keyboard/mobile behavior while APIs are blocked |
| Exclusions | No duplicated stock, coverage, authorization or money rules; no new backend framework |

## D2 — Backend: Platform, Sales & Finance

| Responsibility | Exact scope |
|---|---|
| Mission | Make intake-to-payment reliable and the app reproducibly runnable |
| Features | Auth/roles, CRM, qualification, survey approval, quotations, orders, finance writes, subsidy, files |
| Frontend | Supply contracts/examples; limited emergency UI rescue if D1 misses a checkpoint, coordinated with D1 |
| Backend | Guards, validation adapter, error format, idempotency, SalesService, OrdersService, FinanceService, file access |
| Database | Users/sessions, customers/enquiries/surveys, quotes/lines/orders, invoices/lines/payments/costs, files, subsidy, audit/commands |
| APIs | `/auth`, `/customers`, `/enquiries`, `/surveys`, `/quotes`, `/orders`, `/invoices`, `/payments`, `/files`, `/subsidy-milestones` |
| Directories | `apps/api/src/platform`, `auth`, `sales`, `finance`, `files`, `subsidy`; deployment and CI |
| Dependencies | D3 package/BOM read interface; D4 `ensureJob(tx)`; all helpers accept same transaction |
| Deliverables | Authenticated persisted enquiry; approved survey→frozen quote→order/invoice; deduplicated receipt; local release |
| Acceptance | Unapproved survey cannot quote; retries do not duplicate invoices/payments; unauthorized access rejected |
| Effort | 17–18 focused hours; platform is front-loaded; finance UI remains tables |
| Checkpoints | H6 auth/intake; H13 order/payment; H19 sales join; H22 release |
| Tests | Validation, approval gate, invoice/payment idempotency, auth/files; initial E2E harness |
| Independent work | Auth, validation, finance unit tests, contract fixtures before inventory exists |
| Backup tasks | README, CI, release rehearsal and E2E harness; D3 can assist release operations |
| Exclusions | No inventory transaction implementation; no payment gateway; no universal approval bottleneck |

## D3 — Backend: Inventory, Fulfillment & Database

| Responsibility | Exact scope |
|---|---|
| Mission | Preserve stock correctness and physical equipment history |
| Features | Catalogue/packages, goods receipt costs, stock, serials, allocations, scan records, dispatch, delivery/warranty activation |
| Frontend | Supply fixtures; assist D1 with real-phone/scanner testing; no independent UI redesign |
| Backend | Atomic stock services, unit traceability, replacement stock primitives, delivery activation |
| Database | Product/package/items, stock movements (derived ledger), units/allocations, dispatches, warranties; coordinate migrations |
| APIs | `/products`, `/packages`, `/stock`, `/units`, `/allocations`, `/dispatches`, `/warranties` |
| Directories | `catalog`, `inventory`, `fulfillment`, `warranty`; `prisma/` coordination |
| Dependencies | Confirmed order + recorded-payment gate; D2 `FinanceService.postCost(tx)` |
| Deliverables | Receipt→allocation→scanned dispatch→delivery→warranty with actual costs |
| Acceptance | Concurrent allocations have one winner; no negative stock; warranty starts once; installed unit cannot be allocated again |
| Effort | 16–17 focused hours; one warehouse, no purchasing ERP |
| Checkpoints | H6 catalogue/receipts; isolated allocation early; H15 delivery/warranty; H19 fulfillment/concurrency evidence |
| Tests | Real PostgreSQL concurrency, insufficient-stock rollback, serial uniqueness, repeated dispatch/delivery, replacement history |
| Independent work | Seed catalogue/stock and test locking before sales is complete |
| Backup tasks | Integrity queries, migration replay, ER diagram, backup/restore evidence |
| Exclusions | No financial definitions, customer billing, service coverage decision or multi-warehouse optimization |

## D4 — Backend: Installation, Service & Reporting

| Responsibility | Exact scope |
|---|---|
| Mission | Finish the field and after-sales lifecycle and explain its business outcome |
| Features | Jobs/schedule, completion/time/size/photos/signature, tickets, coverage snapshots, repair/replacement, reports/pay/CSV |
| Frontend | Supply contracts and fixtures; test field capture with D1; no separate UI ownership |
| Backend | JobsService, ServiceService, coverage evaluation, replacement orchestration, read-only report queries |
| Database | Jobs/assignments, time entries, tickets/lines and saved decisions; joins over posted financial data |
| APIs | `/jobs`, `/time-entries`, `/tickets`, `/reports` |
| Directories | `field`, `service`, `reporting` |
| Dependencies | D3 delivered assets/coverage rows and stock helpers; D2 file and finance helpers |
| Deliverables | Evidence-gated completion; explained free/chargeable repair; confirmed closure; reconciled reports |
| Acceptance | Cannot complete without evidence or close without confirmer/channel/time; repair costs affect correct job |
| Effort | 16–17 focused hours; staff-recorded customer confirmation, no full portal/payroll |
| Checkpoints | H4 job/ticket fixtures; field backend in parallel; H20.75 lifecycle/reports; H22 rehearsal |
| Tests | Evidence gates, date boundaries, unauthorized job access, confirmation gate, report reconciliation |
| Independent work | Coverage function, seeded historic jobs, report fixtures |
| Backup tasks | Demo script, acceptance checklist, historical seed scenarios and test evidence |
| Exclusions | No direct invoice/payment/cost writes; no duplicated stock mutation; no AI diagnosis |

## Single-owner cross-cutting responsibilities

| Responsibility | Owner |
|---|---|
| Visual consistency and frontend route tree | D1 |
| Shared API conventions, runtime config, release integration | D2 |
| Finance writes | D2 |
| Migration sequencing and database diagram | D3 |
| Warranty activation | D3 |
| Warranty coverage decisions | D4 |
| Reports and CSV | D4 |
| Acceptance/demo coordination | D4 |
| README/submission checklist | D2 |
| Domain tests and presentation explanation | Each domain owner; D1 explains UI |

## Collaboration rules

- Contracts and fixture payloads by H1.5, first persisted intake UI by H6; do not hand three incompatible APIs to D1 at once.
- At checkpoints: D2 sales slot, D3 fulfillment slot, D4 field/service slot. That backend owner stays available during integration.
- Each owner writes their own business transactions and tests. D3 coordinates migrations; D3 does not become the author of everyone's schema changes.
- D2's FinanceService is the single writer for invoices, receipts and costs. D3/D4 call it with the existing transaction.
- All four commit their own work and present a part of the demo. D2 coordinates merges; every author remains accountable.
