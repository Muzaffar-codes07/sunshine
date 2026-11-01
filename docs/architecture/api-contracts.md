# API contracts and module handoffs

Health/readiness, public enquiries, staff authentication, the staff enquiry queue,
catalogue/package reads, and quote snapshots with recorded sending/acceptance
are implemented. Warranty assessment and
`GET /api/v1/warranties/lookup` use real ADMIN/SUPPORT sessions and persisted equipment/delivery/frozen-quote evidence.
ADMIN policy configuration uses `GET/POST /api/v1/warranty-policies/:productId`; POST requires a saved fingerprint and Idempotency-Key.
Task 2.2 ticket commands and Task
4.1 report calculations/routes are implemented with the integration gates
described below. Other routes below remain planned and need shared schemas and
tests before use. The readiness endpoint checks DB connectivity, not completion
of migrations or business workflows.

## Response convention

Success: `{ "data": ... }`. Error: `{ "error": { "code", "message", "fieldErrors": {}, "requestId", "reasons"? } }`. A 409 refusal adds `reasons: [{code, reason, source, nextAction}]` (`refusalReasonSchema`); one reason keeps its own `code`, several use `NOT_READY`. Build them with `refusal(...)` from `apps/api/src/platform/api-error.ts`. Database constraint refusals are mapped centrally in `apps/api/src/platform/constraint-errors.ts`: a field CHECK becomes a 400 on that field, and anything else becomes a 409 refusal. Register each new constraint there in the PR that adds it; D2 rules are enforced by a unit test. Shared Zod contracts live in `packages/contracts/src/`. No direct ORM models in the browser.

Use 400 invalid input, 401 unauthenticated, 403 unauthorized, 404 unavailable record, 409 invalid transition/stale update, 503 temporary unavailability. Critical mutations receive `Idempotency-Key`; same key/different body is rejected, retry of committed identical command returns its recorded result. Business effect, audit and command result share a transaction. Built in C7: take the key with `@IdempotencyKey()` and wrap the command in `IdempotencyService.run({actorId, key, action, payload}, (tx) => work)` from `apps/api/src/platform/idempotency.ts`. Keys are per actor, 8–128 of `[A-Za-z0-9_-]` (send a UUID per user action); a reused key with another body or action is 409 `IDEMPOTENCY_CONFLICT`. `work` must do all its writes on `tx` and return the JSON response body, which is what a retry receives.

| Owner | Planned routes |
|---|---|
| D2 | `/auth/login`, `/auth/logout`, `/auth/me`, `/staff` (active staff for pickers, SALES and ADMIN); `/customers`, `/enquiries`, `/surveys` and approval; `/quotes` and acceptance; `/orders` and confirmation |
| D2 | `/products`, `/packages` (read APIs and caller-transaction catalogue helpers) |
| D2 | `/invoices`, `/payments`, `/files`, `/subsidy-milestones` |
| D3 | `/stock/receipts`, `/stock/transfers`, `/stock/counts`, `/stock/documents/:id` with `validate` and `cancel`, `/stock`, `/stock/movements`, `/stock/as-of`, `/stock/value`, `/stock/integrity`, `/stock/locations`, `/units`, `/orders/:id/allocations`, `/jobs`, `/jobs/assigned`, `/jobs/:id` and `schedule`, `start`, `complete` (implemented); `/dispatches` and scan/dispatch/deliver actions, `/warranties` |
| D4 | `/time-entries`, `/tickets` and assess/resolve/confirm actions, `/reports` and CSV |

I06 draft/scans, actual stock/cost dispatch and delivery are implemented at `POST /orders/:id/dispatches`, `GET /orders/:id/dispatch`, `GET /dispatches/:id`, `POST /dispatches/:id/scans`, `POST /dispatches/:id/dispatch` and `POST /dispatches/:id/deliver`. Complete scans alone never move stock; the posting command performs the atomic issue and costs. Delivery activates configured frozen quote terms. Delivery detail coverage distinguishes ACTIVE, NOT_STARTED, EXPIRED, VOID and NO_POLICY.

## H1.5 interfaces

```text
JobsService.ensureJob(tx, confirmedOrder)
FinanceService.ensureSalesInvoice(tx, order)
FinanceService.recordPayment(tx, invoice, receipt)
CostWriterService.postCost(tx, { uniqueSourceId, jobId, costType, amount, description, occurredAt, reversalOfId? })
InventoryService.allocate(tx, sourceRequirement)
InventoryService.dispatch(tx, allocationIds, scannedUnitIds)
WarrantyService.activateFromDelivery(tx, delivery)
ServiceService.resolve(tx, ticket, repairResult)
```

Helpers accept the caller's transaction. No upload/network request inside a stock/money transaction. Confirmation creates obligations/job/invoice; separately recorded payment gates allocation and work. D4 replacement orchestration invokes D3 stock helpers and D2 finance helpers atomically.

## Planned state transitions

- Survey (built in C4): SCHEDULED → SUBMITTED → APPROVED/REJECTED, one row per revision. A decided revision is never edited; a change means scheduling the next revision, and only one revision per enquiry can be open. A quote needs the latest revision to be APPROVED (`SurveysService.requireApprovedSurvey`, else 409 `SURVEY_NOT_APPROVED`). Routes: `POST`/`GET /enquiries/:id/surveys` and `POST /surveys/:id/reschedule|approve|reject` (sales, admin); `GET /surveys/assigned` (technician's own schedule); `POST /surveys/:id/submit` (assigned technician, admin); `GET /surveys/:id` (sales, admin, assigned technician). There is no DRAFT state: scheduling creates the record.
- Quote: DRAFT → SENT → ACCEPTED/REJECTED. Quote creation requires approved survey.
- Order (built in C5): confirmation creates the order, packing requirements and sales invoice together; fulfilment is `released` once any payment is recorded. Fulfilment and completion phases belong to D3 jobs. See [orders handoff](orders-handoff.md).
- Allocation: RESERVED → DISPATCHED → DELIVERED/INSTALLED → RELEASED explicitly; installed unit remains assigned.
- Dispatch: DRAFT → DISPATCHED → DELIVERED.
- Installation: SCHEDULED → IN_PROGRESS → AWAITING_ACCEPTANCE → COMPLETED.
- Ticket: OPEN → ASSESSED → IN_PROGRESS → AWAITING_CUSTOMER_CONFIRMATION → CLOSED.
- Invoice (built in C5): POSTED → PART_PAID → PAID, driven only by recorded receipts; corrections through reversal.

## Early validation rules

Valid email/phone/address; finite nonnegative measurements and bill values; capacity 1–5 kW; on/off-grid explicit; positive quantities; valid timestamp ordering; nonnegative rates; rejected/unapproved survey cannot quote; incomplete BOM cannot confirm; authorization per record/file; no free-form client overrides of totals or warranty status.

## D4 shared contract formats

The D4 schemas and inferred TypeScript types are exported by `@sunshine/contracts`.
Schema names use lower camel case (`warrantyPolicySchema`, `subsidyMilestoneSchema`);
types use PascalCase (`WarrantyPolicy`, `SubsidyMilestone`). See the implementation status above before using domain endpoints.

- Money is a decimal string compatible with `numeric(14,2)`: at most 12 integer digits and two fractional digits. Contribution may be negative; negative zero is rejected.
- Ticket quantities and technician summary hours are decimal strings compatible with `numeric(12,3)`: at most nine integer digits and three fractional digits. Ticket quantities must be positive; summary hours may be zero. Use Decimal arithmetic and serialize before validation; do not coerce through JavaScript numbers.
- `TicketLine` includes `type` (`PART`/`LABOUR`), `description`, `quantity`, `unitCost`, `totalCost`, and `billableToCustomer`. The service supplies totals and billability from saved coverage; this response/domain shape does not authorize client overrides.
- `CreateCostEntryInput` requires the canonical source's timezone-qualified
  `occurredAt` with at most millisecond precision. Replays compare immutable
  job/amount/occurrence/description/reversal linkage; mismatches return 409
  `IDEMPOTENCY_CONFLICT`. Normal amounts are nonnegative. Full signed reversals
  use `reversalOfId`, source `REVERSAL:<original UUID>` and the original job/type
  with its exact negated amount. Missing/wrong/partial/nested or earlier reversals
  return 409 `INVALID_COST_REVERSAL`; posted rows are never overwritten. See the
  [cost writer contract](../../apps/api/src/finance/README.md).
- Task 3.1's internal `RepairBillingService.executeRepairBilling(tx, ticketId, repairItems)`
  accepts only PART/LABOUR source UUID references. A transaction-aware persisted
  source adapter supplies eligible consumed stock/approved time, actual work scope
  and frozen internal/selling rates. Saved ticket coverage derives billability;
  other scopes require reassessment. D3 part postings use STOCK_MOVEMENT sources;
  service labour uses TIME_ENTRY sources. Covered work posts internal job costs
  without an invoice. Chargeable work calls D2's `ServiceInvoiceWriter` port using
  `TICKET:<id>:REPAIR`; selling prices and pre-tax subtotal remain distinct from
  cost. Per-line half-up cents are summed, never binary floats. Ticket billing
  snapshot/lines, source costs and invoice share the caller transaction. One final
  batch per ticket; same canonical references replay saved results and different
  references conflict. No public billing route is added; outer actor-scoped
  authorization/command replay remains required. Both production adapters default
  to 503 pending upstream implementation. See the [service module](../../apps/api/src/service/README.md).
  Persisted PART sources must include their existing allocation `ticketLineId`;
  LABOUR sources omit it. Billing verifies distinct line IDs, ticket/type, exact
  quantity/internal costs and assessed billability, then reuses PART rows and
  inserts only LABOUR rows. The source reader locks/rechecks movement/allocation
  linkage. Requests cannot supply line IDs. New result PART lines retain this ID;
  legacy saved results without it remain replayable.
- `WarrantyPolicy` contains `policyName`, `revision`, `scope`, and positive integer `durationMonths`. `WarrantyStatus` describes lifecycle state separately from `WarrantyAssessmentResult.isCovered` and its explanation; the assessment payload does not require a status field.
- Task 2.1 extends `WarrantyAssessmentResult` with required `asOfDate`, `policyRevision`, `scope`, `coverageStatus` (`COVERED`, `EXPIRED`, `VOID`, `NOT_STARTED`, `NO_WARRANTY`, `OUT_OF_SCOPE`), and `chargeStatus`. Policy name/revision/scope/start/expiry are null together only for `NO_WARRANTY`. Covered work returns `customerCharge: "0.00"` and `chargeStatus: "FREE"`; all other lookup outcomes return null charge and `PENDING_ASSESSMENT` until Task 3.1 assesses billable parts/labour. This is an intentional Task 1.1 contract revision; do not interpret null as a zero invoice. `isCovered` concerns only the returned saved scope; repair orchestration must evaluate its actual work scope separately.
- `WarrantyLookupQuery` accepts a required serial (trimmed, uppercased, maximum 128 characters) and optional manufacturer/product UUIDs. `GET /api/v1/warranties/lookup` returns `{ data: { unit: { id, serial, manufacturerId, productId }, customer: { id, name } | null, job: { id } | null, assessment } }`. It uses server time; clients cannot override the assessment date, coverage or charge through query fields. Scoped duplicates return 409 `AMBIGUOUS_SERIAL`; unknown units return 404 `UNIT_NOT_FOUND`. Production authorization verifies active ADMIN/SUPPORT sessions (401 anonymous/revoked, 403 other roles). Persisted allocation/order/delivery and frozen quote facts are validated before coverage; corrupt sources fail closed with 503. Replacement coverage remains gated on actual service issue/billing evidence. See [warranty runtime](../../apps/api/src/warranty/README.md).
- Warranty boundaries and `DateRangeFilter` are date-only strings (`YYYY-MM-DD`). Warranty expiry and report end dates are exclusive. Report ranges describe IST calendar midnights in `Asia/Kolkata`; the query service converts them to UTC. Confirmation and subsidy event timestamps require a timezone (`Z` or an explicit offset).
- `JobProfitability` describes lifetime `invoicedRevenue`, `cashReceived`, `outstanding`, `actualCost`, and signed `contribution` as of the query cutoff, with `isCompleted` separating provisional work. `PaySummary` supplies technician identity, `totalHours`, and `totalPay` aggregated from frozen entry rates.
- `SubsidyMilestone` is a read projection containing `id`, `jobId`, `stage`, `status`, nullable `submissionDate`/`approvalDate`, decimal `amount`, and nullable `evidenceFileId`. Stage/status are workflow labels, not legal eligibility assertions. Milestone amounts do not imply installer receipts.

## Task 2.2 service ticket lifecycle

Production NestJS ticket commands and reads require active ADMIN/SUPPORT cookie sessions. Every POST uses actor-scoped Idempotency-Key replay; changed intent conflicts. Strict shared contracts and no-store responses apply. The exact route/request/response/state/lock details are in the [service API](../../apps/api/src/service/README.md#production-ticket-commands-and-reads).

- `POST /tickets`: `{unitId,faultDescription}` derives the real delivered installation/customer and creates OPEN/v1.
- `POST /tickets/:id/assess`: `{version,asOfDate,requestedScope}` saves ASSESSED at immutable complaint intake. `asOfDate` must equal saved `createdAt`. Scope correction from ASSESSED is allowed only before any work/financial/replacement effects; prior decisions remain audited.
- `POST /tickets/:id/resolve`: `{version,resolutionDetails,noWorkReason?}` requires verified assessment and matching finalized repair billing. Explicit no-work reason is permitted only with zero work, replacement or invoice effects; notes alone cannot resolve a claimed repair.
- `POST /tickets/:id/confirm`: `{version,confirmerName,channel,confirmedAt,notes?}` records actual staff-confirmed customer acceptance after resolution and closes the ticket. CLOSED is immutable.
- `GET /tickets/:id` and `GET /tickets?page=1&pageSize=20&status=OPEN&unitId=...` read saved facts; they never reassess on reload.
- `GET /tickets/:id/events?page=1&pageSize=20` returns actor/time/status and prior/current assessment history, without raw private billing snapshots.

Responses use `{data:ServiceTicket}` with `sourceVerified`, `noWorkReason`, `billingFinalized` alongside the existing identity/version/coverage/resolution/confirmation fields. POST create returns 201, actions 200. Command, ticket and append-only before/after events commit together; exact retries create no extra events. State/source/financial guards are enforced by migration `20261031840000_service_ticket_integrity` as well as services. Old rows retain null creator/source-verification and are never silently adopted; invalid historical links require reconciliation. Actual repair sources and replacement posting remain separate open gates. These commands do not fabricate stock, labour or invoices.

Task 3.2 extends ticket responses with nullable `replacedUnitId` and `newUnitId`.
The original `unitId` remains the defective unit; lineage is retained through
resolution/closure. The internal `ReplacementService.executeReplacement(tx,
{ticketId, oldUnitId, newUnitId, assessmentDate})` adds no public route. It invokes
D3's stock port and Task 3.1 billing under the same caller transaction, preserves
original warranty dates/policy/void flag and saves an immutable replay result.
The current helper contract uses RESERVED assignment for the new unit and QUARANTINED for the old unit. D3/D4 must reconcile assignment with actual issue and cost posting before wiring the replacement adapter. D3's unavailable
stock adapter fails with 503 `REPLACEMENT_STOCK_UNAVAILABLE`; it requires real
stock/source/auth/migration integration before production. See the
[service handoff](../../apps/api/src/service/README.md#task-32-hardware-replacement).

## Task 4.1 director reports

Report routes verify actual ADMIN sessions and read persisted Job/Invoice/Payment,
cost and approved installation-time sources. Service-time pay is excluded explicitly.
Pending migrations return
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
  counts. Each production entry's exact elapsed milliseconds times its frozen hourly
  rate rounds half-up to cents before summing; display hours are rounded separately
  to three places. Current technician rates never reprice prior work. Reads post no ledger entries.
- `GET /api/v1/reports/export.csv?report=overview&period=month` returns a UTF-8
  CSV attachment; `export-csv` is an alias. The strict report selector is required:
  `overview` and `pay` accept only an optional period (default today);
  `profitability` requires only `jobId=<uuid>` and exports lifetime job results.
  No client cutoffs, rates, totals or access overrides. CSV uses RFC 4180 quoting
  and CRLF, safe formula text cells (including leading whitespace/controls), and
  typed numeric columns preserving negative financial losses. Empty pay exports
  contain headers only. Downloads have a fixed filename, no-store and nosniff.
  Failures before streaming retain standard JSON envelopes.

Both routes require the verified ADMIN guard. Installation-time approval and rates now use real persisted sources; pay JSON/CSV identify `INSTALLATION_ONLY` because service time is not yet integrated. Pay uses recorded milliseconds × the frozen rate rounded half-up to cents; rounded display hours are not multiplied to calculate pay. Unsupported or corrupt source facts fail closed rather than becoming a zero rate. See the [labour approval API](../../apps/api/src/labour/README.md).

### Reporting runtime follow-up

ADMIN-only `GET /reports/operations?jobsPage=1&ticketsPage=1&pageSize=20` returns `{data:{asOf,jobs:{items,total,page,pageSize},tickets:{items,total,page,pageSize}}}`. Lists contain current unfinished jobs/open tickets, with separate page controls (1–10000), page size 1–50 and deterministic ordering. This portfolio queue is independent of financial period filters. Financial overview/profitability/CSV consume persisted sources. Installation pay consumes approved frozen rates; service-time pay remains excluded explicitly. Completed jobs with unapproved/reversed labour, missing historical time or unfinished service costing remain provisional.
