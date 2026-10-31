# API contracts and module handoffs

Health/readiness, public enquiries, staff authentication, the staff enquiry queue, and catalogue/package reads are implemented. Other routes below remain planned and need shared schemas and tests before use. The readiness endpoint checks DB connectivity, not completion of migrations or business workflows.

## Response convention

Success: `{ "data": ... }`. Error: `{ "error": { "code", "message", "fieldErrors": {}, "requestId", "reasons"? } }`. A 409 refusal adds `reasons: [{code, reason, source, nextAction}]` (`refusalReasonSchema`); one reason keeps its own `code`, several use `NOT_READY`. Build them with `refusal(...)` from `apps/api/src/platform/api-error.ts`. Database constraint refusals are mapped centrally in `apps/api/src/platform/constraint-errors.ts`: a field CHECK becomes a 400 on that field, and anything else becomes a 409 refusal. Register each new constraint there in the PR that adds it; D2 rules are enforced by a unit test. Shared Zod contracts live in `packages/contracts/src/`. No direct ORM models in the browser.

Use 400 invalid input, 401 unauthenticated, 403 unauthorized, 404 unavailable record, 409 invalid transition/stale update, 503 temporary unavailability. Critical mutations receive `Idempotency-Key`; same key/different body is rejected, retry of committed identical command returns its recorded result. Business effect, audit and command result share a transaction.

| Owner | Planned routes |
|---|---|
| D2 | `/auth/login`, `/auth/logout`, `/auth/me`; `/customers`, `/enquiries`, `/surveys` and approval; `/quotes` and acceptance; `/orders` and confirmation |
| D2 | `/products`, `/packages` (read APIs and caller-transaction catalogue helpers) |
| D2 | `/invoices`, `/payments`, `/files`, `/subsidy-milestones` |
| D3 | `/stock/receipts`, `/units`, `/orders/:id/allocations`, `/dispatches` and scan/dispatch/deliver actions, `/warranties` |
| D4 | `/jobs` and schedule/start/complete actions, `/time-entries`, `/tickets` and assess/resolve/confirm actions, `/reports` and CSV |

## H1.5 interfaces

```text
JobsService.ensureJob(tx, confirmedOrder)
FinanceService.ensureSalesInvoice(tx, order)
FinanceService.recordPayment(tx, invoice, receipt)
FinanceService.postCost(tx, uniqueSource, job, amount)
InventoryService.allocate(tx, sourceRequirement)
InventoryService.dispatch(tx, allocationIds, scannedUnitIds)
WarrantyService.activateFromDelivery(tx, delivery)
ServiceService.resolve(tx, ticket, repairResult)
```

Helpers accept the caller's transaction. No upload/network request inside a stock/money transaction. Confirmation creates obligations/job/invoice; separately recorded payment gates allocation and work. D4 replacement orchestration invokes D3 stock helpers and D2 finance helpers atomically.

## Planned state transitions

- Survey (built in C4): SCHEDULED → SUBMITTED → APPROVED/REJECTED, one row per revision. A decided revision is never edited; a change means scheduling the next revision, and only one revision per enquiry can be open. A quote needs the latest revision to be APPROVED (`SurveysService.requireApprovedSurvey`, else 409 `SURVEY_NOT_APPROVED`). Routes: `POST`/`GET /enquiries/:id/surveys` and `POST /surveys/:id/reschedule|approve|reject` (sales, admin); `GET /surveys/assigned` (technician's own schedule); `POST /surveys/:id/submit` (assigned technician, admin); `GET /surveys/:id` (sales, admin, assigned technician). There is no DRAFT state: scheduling creates the record.
- Quote: DRAFT → SENT → ACCEPTED/REJECTED. Quote creation requires approved survey.
- Order: CONFIRMED → PAYMENT_PENDING → READY → FULFILLMENT → COMPLETED.
- Allocation: RESERVED → DISPATCHED → DELIVERED/INSTALLED → RELEASED explicitly; installed unit remains assigned.
- Dispatch: DRAFT → DISPATCHED → DELIVERED.
- Installation: SCHEDULED → IN_PROGRESS → AWAITING_ACCEPTANCE → COMPLETED.
- Ticket: OPEN → ASSESSED → IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION → CLOSED.
- Invoice: DRAFT → POSTED → PART_PAID/PAID; corrections through reversal.

## Early validation rules

Valid email/phone/address; finite nonnegative measurements and bill values; capacity 1–5 kW; on/off-grid explicit; positive quantities; valid timestamp ordering; nonnegative rates; rejected/unapproved survey cannot quote; incomplete BOM cannot confirm; authorization per record/file; no free-form client overrides of totals or warranty status.
