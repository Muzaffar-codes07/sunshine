# API contracts and module handoffs

Health/readiness, public enquiries, staff authentication, the staff enquiry queue,
and catalogue/package reads are implemented. Warranty assessment and
`GET /api/v1/warranties/lookup` are implemented with injected interfaces;
production lookup returns 503 until staff authorization, Unit/Job reads and the
coordinated warranty migration are integrated. Other routes below remain planned
and need shared schemas and tests before use. The readiness endpoint checks DB
connectivity, not completion of migrations or business workflows.

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

- Survey: DRAFT → SCHEDULED → SUBMITTED → APPROVED/REJECTED. Approved edits create a new revision.
- Quote: DRAFT → SENT → ACCEPTED/REJECTED. Quote creation requires approved survey.
- Order: CONFIRMED → PAYMENT_PENDING → READY → FULFILLMENT → COMPLETED.
- Allocation: RESERVED → DISPATCHED → DELIVERED/INSTALLED → RELEASED explicitly; installed unit remains assigned.
- Dispatch: DRAFT → DISPATCHED → DELIVERED.
- Installation: SCHEDULED → IN_PROGRESS → AWAITING_ACCEPTANCE → COMPLETED.
- Ticket: OPEN → ASSESSED → IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION → CLOSED.
- Invoice: DRAFT → POSTED → PART_PAID/PAID; corrections through reversal.

## Early validation rules

Valid email/phone/address; finite nonnegative measurements and bill values; capacity 1–5 kW; on/off-grid explicit; positive quantities; valid timestamp ordering; nonnegative rates; rejected/unapproved survey cannot quote; incomplete BOM cannot confirm; authorization per record/file; no free-form client overrides of totals or warranty status.

## D4 shared contract formats

The D4 schemas and inferred TypeScript types are exported by `@sunshine/contracts`.
Schema names use lower camel case (`warrantyPolicySchema`, `subsidyMilestoneSchema`);
types use PascalCase (`WarrantyPolicy`, `SubsidyMilestone`). See the implementation status above before using domain endpoints.

- Money is a decimal string compatible with `numeric(14,2)`: at most 12 integer digits and two fractional digits. Contribution may be negative; negative zero is rejected.
- Ticket quantities and technician summary hours are decimal strings compatible with `numeric(12,3)`: at most nine integer digits and three fractional digits. Ticket quantities must be positive; summary hours may be zero. Use Decimal arithmetic and serialize before validation; do not coerce through JavaScript numbers.
- `TicketLine` includes `type` (`PART`/`LABOUR`), `description`, `quantity`, `unitCost`, `totalCost`, and `billableToCustomer`. The service supplies totals and billability from saved coverage; this response/domain shape does not authorize client overrides.
- `WarrantyPolicy` contains `policyName`, `revision`, `scope`, and positive integer `durationMonths`. `WarrantyStatus` describes lifecycle state separately from `WarrantyAssessmentResult.isCovered` and its explanation; the assessment payload does not require a status field.
- Task 2.1 extends `WarrantyAssessmentResult` with required `asOfDate`, `policyRevision`, `scope`, `coverageStatus` (`COVERED`, `EXPIRED`, `VOID`, `NOT_STARTED`, `NO_WARRANTY`, `OUT_OF_SCOPE`), and `chargeStatus`. Policy name/revision/scope/start/expiry are null together only for `NO_WARRANTY`. Covered work returns `customerCharge: "0.00"` and `chargeStatus: "FREE"`; all other lookup outcomes return null charge and `PENDING_ASSESSMENT` until Task 3.1 assesses billable parts/labour. This is an intentional Task 1.1 contract revision; do not interpret null as a zero invoice. `isCovered` concerns only the returned saved scope; repair orchestration must evaluate its actual work scope separately.
- `WarrantyLookupQuery` accepts a required serial (trimmed, uppercased, maximum 128 characters) and optional manufacturer/product UUIDs. `GET /api/v1/warranties/lookup` returns `{ data: { unit: { id, serial, manufacturerId, productId }, customer: { id, name } | null, job: { id } | null, assessment } }`. It uses server time; clients cannot override the assessment date, coverage or charge through query fields. Scoped duplicates return 409 `AMBIGUOUS_SERIAL`; unknown units return 404 `UNIT_NOT_FOUND`. Production authorization currently returns 503 `WARRANTY_AUTH_UNAVAILABLE`; the default equipment reader also rejects with 503. See the [warranty integration gate](../../apps/api/src/warranty/README.md).
- Warranty boundaries and `DateRangeFilter` are date-only strings (`YYYY-MM-DD`). Warranty expiry and report end dates are exclusive. Report ranges describe IST calendar midnights in `Asia/Kolkata`; the query service converts them to UTC. Confirmation and subsidy event timestamps require a timezone (`Z` or an explicit offset).
- `JobProfitability` describes lifetime `invoicedRevenue`, `cashReceived`, `outstanding`, `actualCost`, and signed `contribution` as of the query cutoff, with `isCompleted` separating provisional work. `PaySummary` supplies technician identity, `totalHours`, and `totalPay` aggregated from frozen entry rates.
- `SubsidyMilestone` is a read projection containing `id`, `jobId`, `stage`, `status`, nullable `submissionDate`/`approvalDate`, decimal `amount`, and nullable `evidenceFileId`. Stage/status are workflow labels, not legal eligibility assertions. Milestone amounts do not imply installer receipts.
