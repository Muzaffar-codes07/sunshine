# Service module

Owner: **D4**. Status: **Tasks 2.2 lifecycle, 3.1 billing and 3.2 replacement helpers implemented; production integration gated**.

Saved coverage decisions, resolution notes and staff-recorded customer confirmation.
Replacement orchestration preserves equipment lineage and the original warranty interval.

## Commands

All routes return `{ data: ServiceTicket }`. Create returns 201; actions return 200.
All bodies are strict shared contracts; unknown fields are rejected with 400.

- `POST /api/v1/tickets`: `{ unitId, faultDescription }`. Derives customer/job
  from D3's real installation projection; an unassociated unit fails with 409.
  Creates an OPEN ticket and server-generated unique ticket number.
- `POST /api/v1/tickets/:id/assess`: `{ version, asOfDate, requestedScope }`.
  `asOfDate` is a timezone-qualified occurrence timestamp, at or before now.
  OPEN only. Evaluates the named work scope and atomically saves ASSESSED plus
  the full warranty decision, requested scope and server `assessedAt`. The
  decision's `asOfDate` remains the engine's IST calendar date. Historical
  assessments are staff recorded; coverage is not inferred from status alone.
- `POST /api/v1/tickets/:id/resolve`: `{ version, resolutionDetails }`.
  ASSESSED or IN_PROGRESS only; requires a saved assessment. Records notes and
  server `resolvedAt`, then moves to AWAITING_CUSTOMER_CONFIRMATION. No customer
  confirmation or closure is implied. IN_PROGRESS is reserved for future repair
  orchestration; this task permits direct ASSESSED to resolution as the plan asks.
- `POST /api/v1/tickets/:id/confirm`: `{ version, confirmerName, channel,
  confirmedAt, notes? }`. Awaiting confirmation only. Nonblank name, PHONE /
  WHATSAPP / IN_PERSON channel and timezone-qualified timestamp are mandatory.
  Confirmation must occur at or after resolution and at or before server time.
  All confirmation facts, server `closedAt` and CLOSED commit atomically.

Every action requires the current integer version; stale writes return 409
`STALE_VERSION`. Prisma uses status/version compare-and-set and increments the
version in the same transaction as the facts. Illegal transitions return 409
`INVALID_TICKET_TRANSITION`; unknown tickets return 404. Repeated actions cannot
overwrite snapshots or confirmation; after success, reload to obtain a new
version. They do not implement financial-command replay. This task posts no
stock, invoices, costs or warranty changes. Future repair orchestration must
add actor-scoped idempotency and use one transaction for its financial effects.

## Task 3.1 repair billing

`ServiceModule` exports `RepairBillingService.executeRepairBilling(tx, ticketId,
repairItems)`. This is an internal transaction helper, not a public route. Items
are strict `{ type: 'PART' | 'LABOUR', sourceId: UUID }` references (1–200,
unique). They never accept rates, totals, billability, job or customer overrides.
The outer authenticated orchestrator owns staff/target authorization, actor/key
payload hashing and command replay/audit, the transaction and bounded retries.
Any helper exception **must escape and abort that transaction**; do not catch it
and commit earlier writes. Stock consumption, time approval, billing, resolution
and the command result must use that same transaction when composed together.

The helper reads the saved assessment, locks an ASSESSED/IN_PROGRESS ticket with
status/version CAS, then asks `RepairSourceReader.read(tx, ticketId, items)` for
persisted consumed-part/approved-time facts and frozen cost/selling rates. The
reader must lock/recheck source eligibility and ticket/job/customer ownership,
prevent cross-ticket reuse, and return the actual work scope. Mismatched scope
fails with 409; assess that scope separately. This helper handles one assessed
scope and one final billing batch per ticket. It does not infer that component
coverage also includes unrelated labour. Source data and rates are trusted only
from that persisted adapter, never directly from the request body.

Every PART source must supply its existing allocation `ticketLineId` from the
persisted movement/allocation join; LABOUR sources must omit it. The reader must
lock/recheck this relationship in the same transaction. One PART source maps to
one distinct ticket line. Billing verifies the line belongs to this ticket, is
PART, and matches frozen quantity/unit cost/total cost and assessed billability.
Missing or conflicting rows fail with 409 `REPAIR_LINE_CONFLICT`; missing source
IDs fail with 503 `INVALID_REPAIR_SOURCE`. Billing reuses these PART rows and
inserts only LABOUR rows, preserving allocation references and reconciled ticket
totals. New billing results include each PART's `ticketLineId`; the result field
remains optional when replaying historical snapshots. Request references stay
strict type/source IDs; clients cannot override allocation line IDs.

D3 posts consumed parts first through `CostWriterService` with
`STOCK_MOVEMENT:<sourceId>` / `REPAIR_PARTS`. The helper requires this posting,
reuses it via the cost writer and verifies its job/type/amount. Service labour
posts with `TIME_ENTRY:<sourceId>` / `SERVICE_LABOUR`. Both covered and chargeable
repairs retain actual internal costs on the original installation's job. No
ticket-total expense is posted. Quantities use three decimal places, rates two;
integer arithmetic rounds each quantity × rate half-up to cents, then sums.
Line and batch amounts must fit numeric(14,2); overflow aborts with 409.

Covered work has zero customer prices and no invoice call. Uncovered work calls
the exported finance port `ServiceInvoiceWriter.ensureServiceInvoice(tx, input)`
with `TICKET:<ticketId>:REPAIR`, customer/job and selling-price lines (distinct
from internal costs). D2 must implement it through the official invoice helper,
posting once, rejecting changed facts and calculating tax separately. Billing's
`customerCharge` is the pre-tax invoice subtotal; payment/outstanding calculations
belong to finance. Even an uncovered zero-subtotal batch calls the invoice port.
No direct invoice/payment table writes or independent commits occur here.

Ticket lines retain internal costs and derived billability. `billingSnapshot`
saves the canonical reference hash and result (cost/pricing lines, pre-tax totals
and invoice ID) atomically. Same references, regardless of order or UUID case,
replay that frozen result without new reads/posts, including after closure.
Trusted repair source facts must include `occurredAt` from the actual stock
movement or performed work as a timezone-qualified ISO timestamp with at most
millisecond precision. D3's preposted PART cost and the source adapter must return
the same occurrence and canonical description; billing passes both to the shared
cost writer. Scope comparison uses the same trimmed uppercase normalization as
warranty evaluation, without treating different scopes as equivalent.

Changed references conflict; adjustments need explicit reversal/new work, never
editing posted history. Concurrent writes lose CAS and require an outer retry.
Billing moves the ticket to IN_PROGRESS and increments its version; resolution
and customer confirmation remain distinct actions. The earlier notes-only
`resolve` endpoint does not invoke billing or assert that repair work occurred.

Default source/invoice adapters fail with 503 `REPAIR_SOURCES_UNAVAILABLE` /
`SERVICE_INVOICE_UNAVAILABLE`: upstream stock, approved service time and D2's
invoice implementation are absent. There is no fabricated production adapter.
The queued D4 migration also needs `ServiceTicket.billingSnapshot` JSONB, as
described in the schema handoff. Auth/migration gates below still apply.

`apps/api/test/repair-billing.test.cjs` covers covered/chargeable billing with the
real cost writer and report engine, exact rounding/limits, canonical source
reuse, immutable replay/conflicts, validation, CAS and propagated failures. Its
transaction double restores staged state on errors; it is **not** PostgreSQL
rollback/concurrency or live D2/D3 integration evidence. The independent
[Task 3.1 review prompt](../../../../docs/reviews/d4-task-3.1-review-prompt.md)
lists implementation scope and remaining acceptance checks.

## Task 3.2 hardware replacement

`ServiceModule` exports `ReplacementService.executeReplacement(tx, { ticketId,
oldUnitId, newUnitId, assessmentDate })`. This is an internal helper with no new
HTTP route. `assessmentDate` is a timezone-qualified occurrence string; UUIDs
and the instant are canonicalized for durable replay. Future dates and unknown
fields fail with 400. Authorize actor/target access and record actor-scoped
command key/hash/result/audit in the outer transaction, exactly as for billing.

An unresolved ASSESSED/IN_PROGRESS ticket must name the defective unit and have
a saved assessment for the same IST date. Billing must not already be finalized:
the replacement's actual consumed source must participate in that final batch.
Ticket status/version CAS serializes replacement against billing and lifecycle
writes. It moves to IN_PROGRESS, without resolving or closing the ticket.

The D3-owned `ReplacementStockWriter.replace(tx, command)` must lock/recheck both
units in stable order, validate old installation ownership and new availability
and product compatibility, release the old active allocation into QUARANTINE,
and allocate the new unit to the ticket part line. It retains the new unit's
`replacesUnitId`, immutable RETURN/ISSUE movements and actual consumed stock cost
under `STOCK_MOVEMENT:<id>` / REPAIR_PARTS. It returns bounded old/new serial
projections and actual repair source references. The orchestrator checks their
IDs, states, customer/job, predecessor and assessed serial; the persisted adapter
must enforce real inventory eligibility and source-to-new-unit linkage.
Create/reference the actual allocation PART line before returning stock sources;
the source reader returns that same `ticketLineId` for billing reuse. A replacement
with 14000.00 parts and 600.00 labour retains exactly two ticket lines totaling
14600.00, and replay preserves both the line IDs and allocation references.

The primary Task 3.2 guide specifies ALLOCATED; its sample prompt says deployed.
This helper uses ALLOCATED to represent replacement assignment. It does not
claim delivery occurred. D3's physical workflow must reconcile issue/consumption
with this assignment and must not expense reservation alone. If consumption is
deferred, invoke this orchestration at actual issue, not preliminary reservation.
Later delivery must preserve continued coverage, never call standard new-sale
activation and restart the clock.

The original warranty is version-locked and copied exactly: **startDate,
expiryDate, policyName, policyRevision, scope, durationMonths and active**.
An 18-month swap in a 24-month policy therefore retains six months, and expired
or void coverage stays expired or void. Date-only values must be UTC-midnight
Prisma DATE encodings and are never recalculated from the replacement instant.
The original warranty remains as history; only its concurrency version changes.
No original warranty fails with `ORIGINAL_WARRANTY_REQUIRED`: a separate explicit
policy decision is needed. Existing coverage on the new unit fails with
`WARRANTY_CONFLICT`, never an upsert that overwrites unrelated history.

`RepairBillingService` then uses the same transaction and saved decision. Actual
parts and labour reduce the original job's margin; covered work has no invoice,
uncovered work invokes D2 once. No extra replacement-total expense is posted.
The original `ticket.unitId` stays immutable. `replacedUnitId`, `newUnitId` and
`replacementSnapshot` save lineage and the frozen serial/warranty/billing result
with the request hash. Public ticket responses expose the two nullable lineage
IDs. Same input (including UUID case and equivalent offset instants) replays
without reissuing stock, extending coverage or rebilling, even after closure.
Changed swaps conflict; later replacements require a new ticket for the new unit.
This helper supports one swap/final billing batch per ticket.

Every error must abort the caller transaction, including late invoice or snapshot
failure. The helper never starts/commits its own transaction. Real concurrent
unit claims, policy edits and warranty uniqueness require outer bounded retries
plus D3's allocation constraints. The default stock adapter returns 503
`REPLACEMENT_STOCK_UNAVAILABLE`; no production inventory writes are simulated.
Unit/Job, staff authorization, actual repair sources/invoice and the coordinated
migration remain unavailable. The schema handoff includes the lineage columns,
snapshot and pending Unit FKs/checks. No migration is applied here.

`apps/api/test/replacement.test.cjs` composes the real billing/cost helpers with
transaction doubles: six-month continuity, expired/void/leap policies, exact
snapshot copy, lineage, covered/chargeable billing, canonical replay/conflicts,
IST dates, CAS losses, source scope, storage errors and late-failure propagation.
These are not real PostgreSQL isolation, rollback or D3 integration evidence.
See the [Task 3.2 review prompt](../../../../docs/reviews/d4-task-3.2-review-prompt.md).

## Integration gate and tests

`ServiceModule` is registered in AppModule. Its default `ServiceTicketAccess`
returns 503 `SERVICE_AUTH_UNAVAILABLE` before any record read or mutation.
D2 must supply verified permission to manage tickets across customers. Never
trust role headers or unverified `request.user`. Assigned technicians require
record scoping before permitting this broad API.

The module reuses `WarrantyEquipmentReader` exported by WarrantyModule. D3 must
replace its unavailable implementation with actual Unit/customer/Job joins;
creation and assessment currently fail without it. The real Prisma repository
needs the coordinated D4 migration, including new resolution fields, Unit/Job
Restrict relations and integrity checks. Missing storage returns 503
`SERVICE_SCHEMA_UNAVAILABLE`. See the [schema handoff](../../../../docs/architecture/d4-schema-handoff.md).

Run `npm run test` and `npm run check`. `apps/api/test/service.test.cjs` tests the
real warranty engine with injected storage, concurrent CAS semantics, Prisma
query shape, Nest HTTP closure rejection and production authorization gating.
These doubles do not prove migrated PostgreSQL isolation or upstream joins.
No fixtures are wired into production. See [roles](../../../../docs/team/roles.md)
and [API contracts](../../../../docs/architecture/api-contracts.md).
