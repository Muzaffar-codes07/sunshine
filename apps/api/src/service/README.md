# Service module

Owner: **Tuhin/Codex under the D1/D4 takeover**. Production intake, assessment, source verification, resolution/confirmation and audited history use NestJS commands with actual staff sessions and PostgreSQL transactions. Real repair-part, replacement and approved service-time adapters remain separate incomplete work; internal helpers alone do not count as those workflows.

## Production ticket commands and reads

All routes require active ADMIN/SUPPORT cookie sessions, reject role headers, and set `Cache-Control: no-store`. Every POST requires an actor-scoped `Idempotency-Key`. Strict shared Zod contracts reject unknown fields. UUIDs are canonicalized. Same key/action/body replays the committed result even after the ticket advances; changed intent returns 409 `IDEMPOTENCY_CONFLICT`.

| Route | Request | Persisted behavior |
|---|---|---|
| `POST /api/v1/tickets` | `{unitId, faultDescription}` | 201 OPEN/v1. Derives customer/job from the real delivered allocation, order, accepted quote and dispatch; an uninstalled unit returns 409. Separate faults may have separate tickets; one retried intake creates one ticket/event |
| `POST /api/v1/tickets/:id/assess` | `{version, asOfDate, requestedScope}` | 200 ASSESSED. `asOfDate` must equal immutable saved `createdAt`, not a caller-selected historical date. Uses that complaint occurrence in IST and frozen delivery policy. OPEN/ASSESSED may correct scope only before work, invoice, billing or replacement effects; old decisions remain audited |
| `POST /api/v1/tickets/:id/resolve` | `{version, resolutionDetails, noWorkReason?}` | 200 AWAITING_CUSTOMER_CONFIRMATION. Requires verified source and assessment plus matching finalized billing. With no work/financial effects, explicit `noWorkReason` (5–4000 characters) permits a withdrawal or other legitimate no-work resolution. Notes alone cannot pretend a repair was performed |
| `POST /api/v1/tickets/:id/confirm` | `{version, confirmerName, channel, confirmedAt, notes?}` | 200 CLOSED. Channel PHONE/WHATSAPP/IN_PERSON; actual confirmation at/after resolution and not future. This is staff-recorded confirmation, not a customer portal event |
| `GET /api/v1/tickets/:id` | UUID | Saved `{data:ServiceTicket}`; never silently reassesses |
| `GET /api/v1/tickets` | `page=1&pageSize=20`, optional `unitId`, `status` | `{data:{items,total,page,pageSize}}`; page 1–10000, size 1–50; newest intake then UUID |
| `GET /api/v1/tickets/:id/events` | `page=1&pageSize=20` | Bounded audited history with real actor, occurrence, prior/current status and coverage decision. Private raw billing snapshots/internal costs are not exposed |

Every action claims the current integer version; stale requests return 409 `STALE_VERSION`, invalid states `INVALID_TICKET_TRANSITION`, missing IDs 404. Command, ticket and before/after audit commit or roll back together. Lock order is Command → Job → Ticket → Unit (intake has no existing Ticket). Equipment and warranty readers use the same caller transaction. No upload/network work runs under these locks.

`TicketCommandsController` is the production controller. Historical `ServiceController` / `ServiceTicketAccess` doubles remain isolated foundation tests and are not registered as production routes. The real session actor is passed by the controller, not accepted from a body/header. SQL checks verify that actor is still active and ADMIN/SUPPORT.

Migration `20261031840000_service_ticket_integrity` adds nullable source-verification/creator fields and append-only `ServiceTicketEvent`. Existing rows receive no invented creator or validation. Verified facts cannot be rewritten, CLOSED is terminal, version claims/state transitions are guarded, and audit update/delete/truncate refuse. Existing eligible OPEN/ASSESSED rows can be verified by actual reassessment; inconsistent/closed historical rows require separate reconciliation rather than fabricated adoption. The response adds `sourceVerified`, `noWorkReason`, and `billingFinalized`.

SQL billing checks require actual per-source costs, reconciled ticket totals and matching customer invoices for chargeable work. Covered work retains costs and has no customer invoice. Any missing, reversed or conflicting financial evidence blocks resolution. The no-work path refuses existing work lines, replacement effects or invoices. It is not an alternative to implementing repair workflows.

`/workspace/service` supports saved links, paged filtering/history, intake and these lifecycle commands. Its shared retry hook freezes the exact body/key and disables edits after an uncertain outcome. Reload reads persisted state. The scope occurrence is shown as saved intake time; closure explicitly asks for no-work evidence when repair billing is absent.

## Verification

Run the root `npm run check`, then on an explicitly disposable PostgreSQL 17.11 database bind **both** `DATABASE_URL` and `TEST_DATABASE_URL` before `npm run db:deploy`, API/web `test:db`, `npm run test:d4-migration`, `npm run db:check`, migration diff and `npm run test:constraints`. Do not allow a normal local `.env` to choose the migration target.

`apps/api/test/service-runtime.db.test.mjs` exercises actual session HTTP and complete survey→quote→payment→stock→delivery→installation sources, concurrent intake/reassessment, canonical IDs, audit history, source/role/input refusals, no-work boundaries, confirmation and late caller rollback. The repair-invoice/migration fixtures also create real delivered installations through domain writers; synthetic source-reader doubles remain explicitly limited billing-boundary tests. The production browser driver `apps/web/test/lifecycle-browser.mjs --migrate` validates its `_test` URL before migrations and covers actual UI intake, exact retry, scope corrections/history and no-work closure.

## Task 3.1 repair billing

### Persisted part requirements

ADMIN approves part requirements at `GET/POST /tickets/:id/parts`; SUPPORT retains the existing ticket lifecycle, without access to part prices/internal costs. This role boundary is an MVP implementation decision. POST requires `{version,productId,quantity,scope,reason}` plus Idempotency-Key. It derives description/Product identity, current catalogue selling price and coverage billability server-side. Clients cannot supply costs, prices, customer/job, creator, phase or billability. The explicit scope must match the saved assessment. Serialized requirements are one physical unit per line; bulk quantity has three decimal places. Adding another physical unit means another requirement, preserving one future allocation/consumed-source per line.

`POST /tickets/:id/parts/:lineId/cancel` takes `{version,lineVersion,reason}` and an Idempotency-Key. Only an unused PLANNED requirement can cancel. Its original Product, quantity, price, scope, creator and description remain frozen, with cancellation actor/time/reason retained. Issued/legacy/cancelled lines cannot be edited or deleted. There is currently no issued-PART producer: requirements do not reserve or consume stock, and the real repair-source/replacement adapters remain gated.

Command response: `{data:{ticketVersion,part}}`; create/cancel return 201. Reads use page 1–10000 and pageSize 1–50, default 20, returning `{data:{items,total,page,pageSize}}` in one RepeatableRead transaction. Product UUID/quantity normalization happens before replay hashing. Identical retries return the saved result even after catalogue changes or cancellation; changed intent conflicts. Two independent commands claiming one version have one winner. The command, line, ticket version and ticket event commit together. Creation locks Command → Job → Ticket → Product before reading its price; cancellation locks Command → Job → Ticket → line. Future stock mutations extend this to line → sorted Products → sorted stock keys → sorted Units; no receipt may acquire Job/Ticket after stock locks.

Migration `20261031850000_ticket_part_requirements` gives PART a restrictive Product FK and PLANNED/ISSUED/CANCELLED phase. All older lines receive LEGACY with null Product/creator/scope/price; no historical requirement or consumption state is guessed. New lines cannot select LEGACY. Planned costs are null, representing unknown cost rather than zero expense. Cancelled, unused requirements are excluded from no-work/reassessment obligations; any active work still blocks bypass. The SQL source/immutability/shape guards verify the assessed ticket, real actor, stocked Product, whole serialized quantity and frozen catalogue price. Actual issue requires a later allocation/movement/cost source adapter and will not be simulated by changing a phase.

Internal unit-cost rates retain six decimals, matching existing bulk moving-average precision; posted totals and customer prices remain cents. Quantity millis × cost micros / 10^7 rounds half-up once to cents. For example, 1.500 × 12.345678 posts 18.52; rounding the rate to 12.35 first would incorrectly post 18.53. Existing two-decimal snapshots remain readable and unchanged. New requirements have no internal cost until real consumption; widening a numeric column never posts money.

`/workspace/service?ticket=<id>` exposes the ADMIN requirement form, paged saved rows, explicit unused cancellation, error states and exact-body/key retry after an uncertain result. Historical rows display their missing Product/source state explicitly. This is a real persisted planning/cancellation workflow, not repair completion or an inventory shortcut.

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
from internal costs). D2 implements it through the official invoice helper (see the [repair invoice handoff](../../../../docs/architecture/repair-invoice-handoff.md)),
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
and customer confirmation remain distinct actions. The production resolve command requires finalized billing or the explicitly constrained no-work path above.

The production source reader still fails with 503 `REPAIR_SOURCES_UNAVAILABLE` until actual consumed parts and approved service time exist. The official D2 invoice writer is wired (merged #70); isolated real-PostgreSQL billing tests verify that boundary. The D4 schema, real ticket authorization, source verification and command replay are implemented. No fabricated repair-source adapter is wired.

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
and product compatibility, release the old active allocation into QUARANTINED,
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

The primary Task 3.2 guide specifies RESERVED; its sample prompt says deployed.
This helper uses RESERVED to represent replacement assignment. It does not
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
The historical helper's version-only warranty update is incompatible with the newer immutable warranty guards and must be revised before wiring actual replacement. The production replacement adapter remains disabled; do not claim warranty continuation from these helper tests.
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
The real Unit/Job/File models and coordinated D4 migration are now present,
including ticket lineage FKs/checks. Actual repair sources, allocation ticket-line support and the replacement stock writer remain unavailable. Unit predecessor history and the official invoice writer are implemented, but do not enable replacement consumption. No production replacement stock writes are enabled.

`apps/api/test/replacement.test.cjs` composes the real billing/cost helpers with
transaction doubles: six-month continuity, expired/void/leap policies, exact
snapshot copy, lineage, covered/chargeable billing, canonical replay/conflicts,
IST dates, CAS losses, source scope, storage errors and late-failure propagation.
These are not real PostgreSQL isolation, rollback or D3 integration evidence.
See the [Task 3.2 review prompt](../../../../docs/reviews/d4-task-3.2-review-prompt.md).

## Remaining integration gates

The internal billing/replacement unit suites use transaction doubles and are not proof of physical replacement, approved service time, PostgreSQL stock races or coverage continuation. Actual part reservation/issue/return and replacement must use the single stock ledger and cost writer, distinct physical units and real movement sources. Service time needs separately approved internal pay and customer selling terms. These gates remain open; no parent checklist requiring them is complete.
