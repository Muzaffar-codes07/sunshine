# API contracts and module handoffs

Health/readiness, public enquiries, staff authentication, the staff enquiry queue,
and catalogue/package reads are implemented. Warranty assessment and
`GET /api/v1/warranties/lookup` are implemented with injected interfaces;
production lookup returns 503 until staff authorization, Unit/Job reads and the
coordinated warranty migration are integrated. Task 2.2 ticket commands and Task
4.1 report calculations/routes are implemented with the integration gates
described below. Other routes below remain planned and need shared schemas and
tests before use. The readiness endpoint checks DB connectivity, not completion
of migrations or business workflows.

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

## Task 2.2 service ticket lifecycle

The [service module](../../apps/api/src/service/README.md) implements four POST
routes returning `{ data: ServiceTicket }`, with strict shared request contracts:

- `/api/v1/tickets`: `{ unitId, faultDescription }`, 201 OPEN. Customer and job
  IDs derive from the actual unit installation; client linkage/status overrides
  are rejected. Missing installation association is 409 `INSTALLATION_REQUIRED`.
- `/api/v1/tickets/:id/assess`: `{ version, asOfDate, requestedScope }`, 200
  ASSESSED from OPEN. Input `asOfDate` is a timezone-qualified instant no later
  than now. Snapshot contains the complete warranty result (including its IST
  date, saved policy revision/scope/dates and reason), actual requested work scope
  and server `assessedAt`. Snapshot billability is not a final invoice; component
  coverage does not promise free unrelated labour. Later policy edits do not
  recalculate the saved decision.
- `/api/v1/tickets/:id/resolve`: `{ version, resolutionDetails }`, 200
  AWAITING_CUSTOMER_CONFIRMATION from ASSESSED or IN_PROGRESS. Requires a saved
  assessment, records work notes and server `resolvedAt`. Direct ASSESSED to
  resolution is supported for Task 2.2; IN_PROGRESS is reserved for repair work.
- `/api/v1/tickets/:id/confirm`: `{ version, confirmerName, channel, confirmedAt,
  notes? }`, 200 CLOSED from AWAITING_CUSTOMER_CONFIRMATION only. Name must be
  nonblank, channel is PHONE/WHATSAPP/IN_PERSON and confirmedAt is a timezone-
  qualified instant at or after resolution and no later than now. Missing facts
  fail with 400 `INVALID_INPUT`, leaving the ticket open. The response labels
  these as staff-recorded confirmation facts; it is not a customer portal event.

All actions require a positive integer `version`. Status/version compare-and-set
saves each transition and facts atomically; conflicts return 409 `STALE_VERSION`
or `INVALID_TICKET_TRANSITION`. CLOSED is terminal. The response contains
identity/linkage, status/version, fault, nullable assessmentSnapshot,
resolutionDetails/resolvedAt, nullable `confirmation: CustomerConfirmation`,
closedAt, createdAt and updatedAt. No raw ORM rows or contact details are exposed.

Production routes return 503 `SERVICE_AUTH_UNAVAILABLE` before reading tickets
until D2 integrates verified cross-customer staff permission. Unit/Job reads and
the coordinated D4 migration are also outstanding. Missing ticket tables/columns
return `SERVICE_SCHEMA_UNAVAILABLE`. Resolution in this task records notes only;
Task 3.1/3.2 must orchestrate stock/finance with command idempotency and one shared
transaction. No billing or stock effects are posted by these commands.

## Task 4.1 director reports

Report routes and calculations are implemented with injectable upstream readers;
production routes return 503 `REPORTING_AUTH_UNAVAILABLE` until verified ADMIN
authorization is integrated. Job/Invoice/Payment models are absent and their
default reader returns `REPORTING_SOURCE_UNAVAILABLE`. Pending migrations return
`REPORTING_SCHEMA_UNAVAILABLE`. See the [reporting handoff](../../apps/api/src/reporting/README.md).

- `GET /api/v1/reports/profitability?jobId=<uuid>` returns `JobProfitabilityReport`:
  the lifetime profitability fields plus server `asOf`, `costBreakdown` (material,
  installationLabour, serviceLabour, repairParts), `isProvisional`,
  `unfinishedSteps`, `completedProfit` and nullable `marginPercentage`. Unfinished
  work has zero completed profit but retains provisional contribution. Outstanding
  is floored at zero. Margin percentage is contribution / invoiced revenue * 100,
  rounded half away from zero to two places; nonpositive revenue yields null.
- `GET /api/v1/reports/overview?period=today|week|month` returns `PeriodSummary`:
  selected period (default today), `timezone: Asia/Kolkata`, half-open calendar
  `startDate`/`endDate`, UTC `startUtc`/`endUtc`, server `asOf`, distinct
  `invoicedRevenue`/`cashReceived`/`actualCost` and `costBreakdown`. Weeks start
  Monday. Include only activity up to `asOf` within the calendar window. These
  totals do not represent completed profit or lifetime contribution.
- `GET /api/v1/reports/subsidies` returns `SubsidyReport`: `asOf` and status
  `groups`, each with `status`, `count`, `totalAmount`, and `milestones`.
  `SubsidyReportMilestone` extends the base projection with `pendingDocuments`
  and nullable `responsibleOwner: { id, name }`. Status buckets are PENDING_DOCS,
  SUBMITTED, APPROVED, DISBURSED and REJECTED (including empty groups).

All three return `{ data: ... }`; query parameters are strict. Cutoffs are
server controlled. Report aggregate amounts are signed, exact two-place decimal
strings without a per-row numeric(14,2) cap; old base contracts retain that cap.
Include posted corrections/refunds once. Cash, pending claims and subsidy awards
do not create invoiced revenue.

## Task 4.2 technician pay and CSV

- `GET /api/v1/reports/pay-summary?period=today|week|month` (default today)
  returns `{ data: TechnicianPayReport }`: IST range, UTC boundaries, server
  cutoff, `technicians: [{ technicianId, technicianName, totalHours, totalPay }]`
  and grand `totalHours`/`totalPay`. Hours are exact three-place decimal strings;
  pay is nonnegative two-place decimal strings with aggregate precision. Only
  approved work in the half-open period, occurred and approved by the cutoff,
  counts. Each entry's hours times frozen rate rounds half-up to cents before
  summing; current technician rates never reprice prior work. No ledger writes.
- `GET /api/v1/reports/export.csv?report=overview&period=month` returns a UTF-8
  CSV attachment; `export-csv` is an alias. The strict report selector is required:
  `overview` and `pay` accept only an optional period (default today);
  `profitability` requires only `jobId=<uuid>` and exports lifetime job results.
  No client cutoffs, rates, totals or access overrides. CSV uses RFC 4180 quoting
  and CRLF, safe formula text cells (including leading whitespace/controls), and
  typed numeric columns preserving negative financial losses. Empty pay exports
  contain headers only. Downloads have a fixed filename, no-store and nosniff.
  Failures before streaming retain standard JSON envelopes.

Both routes require the existing verified ADMIN guard. Until upstream TimeEntry
storage, approval timestamps and frozen rate snapshots exist, the production time
reader throws `REPORTING_TIME_SOURCE_UNAVAILABLE` (503) after authorization. The
default authorization still throws `REPORTING_AUTH_UNAVAILABLE`. Injected unit/HTTP
tests do not prove real PostgreSQL integration. See the reporting handoff above.
