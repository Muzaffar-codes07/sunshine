# SunPower Solutions: Solar Installation Management System

Status: agreed product direction for implementation. Business workflows below are
requirements, not claims of completed functionality. The current codebase is an
infrastructure scaffold; see the [root README](../../README.md).

## 1. Purpose and scope

Provide one connected operational record for a solar installation company handling
approximately 40 rooftop projects per month, as described in the proposed brief.
Replace scattered registers, manual quotations and lost paperwork across enquiry,
survey, quotation, payment, fulfillment, installation and long-term service.

The [supplied problem statement](solar-problem-statement.pdf) remains the
authoritative functional brief. This PRD consolidates the team's product proposal
with the repository's reviewed rules. The [organizer deliverables](organizer-video-deliverables.md)
record the supplied local relational database/custom API/no-BaaS constraints; they
do not independently verify current event rules or deadlines.

Use the existing React/Vite/TypeScript frontend, NestJS API, Prisma and local
PostgreSQL architecture. One company, one warehouse, online operation and manual
payment recording define the hackathon baseline.

## 2. Users and access

- **Customer:** submits a public web enquiry, makes payments outside the app,
  signs on the installer's device and confirms repair outcomes. Staff record
  phone/WhatsApp enquiries, receipts and service requests. The later customer
  extension allows verified-email login, customer-scoped read pages and contact
  edits. Self-service ticket requests and online payments remain deferred.
- **Sales representative:** qualifies enquiries, schedules surveys and prepares
  quotations and orders within authorized workflows.
- **Field technician:** uses a phone/tablet for assigned surveys and jobs, time
  records, component confirmation, photos and customer signatures.
- **Warehouse manager:** receives stock, tracks equipment, allocates units and
  scans required serials before dispatch.
- **Support agent:** searches customers/equipment, assesses coverage, coordinates
  repairs and records customer confirmation.
- **Director/admin:** reviews operational queues, revenue, costs, margins,
  unpaid invoices, technician pay summaries and subsidy paperwork.

Seeded staff accounts, server-side sessions and role/record-level authorization
are required. The Customer persona does not add a staff role. Public enquiry is
the limited unauthenticated entry point; private files and staff actions require
authorization. See [architecture](../architecture/README.md).

## 3. Core modules and acceptance criteria

### 3.1 Lead management and site survey

Maintain one enquiry queue with WEB, PHONE and WHATSAPP source labels. Web forms
persist enquiries directly; staff enter phone and WhatsApp enquiries. Live
WhatsApp ingestion and automatic outbound messaging are outside the baseline.

Record customer contact/address, owner, next follow-up date, roof suitability,
monthly electricity bill and grid suitability. Assign survey technicians and
dates. The mobile survey records roof direction, tilt and cable distance, plus
measurements needed for the proposed installation.

Acceptance:

- Invalid contact or survey values show field errors and produce no partial write.
- A submitted web enquiry appears in the persisted sales queue after refresh.
- An assigned technician can access the authorized survey from their schedule.
- A quotation cannot be created until the survey is approved. Editing an approved
  survey creates a new revision and preserves the prior approval evidence.

### 3.2 Quoting, orders and payments

Generate 1-5 kW On-Grid/Off-Grid quotations from seeded package templates. Freeze
prices, service scope and the complete bill of materials (BOM) into quote lines;
subsequent catalogue edits must not rewrite an accepted quotation.

Confirmation creates the job, invoice and packing requirements. Record advance,
partial or full receipts separately; recorded payment gates allocation and work.
Warehouse queues and technician schedules reflect persisted order changes without
requiring office phone calls. This does not require external messaging.

Acceptance:

- An incomplete BOM or unapproved survey blocks the relevant transition.
- A confirmed order creates its job/invoice/packing obligations once.
- Repeating a confirmation or payment command cannot duplicate records or balances.
- Outstanding balance reflects posted invoices and recorded receipts; customer
  totals are calculated by the backend.

### 3.3 Inventory, dispatch and warranty

Track products, package templates, receipts, actual acquisition costs, quantities,
physical serials, reservations and immutable stock movements. Reserve complete
requirements atomically; a failed allocation leaves no partial reservation.

Require scanning each inverter, battery and charge controller before dispatch.
Serialize panels too for per-unit warranty traceability. Keep original scan text,
normalized serial and stable unit identity. Link delivered equipment to its job
and customer.

Delivery starts each unit's warranty once. Store product/policy-specific duration,
start, expiry and applicable scope; example brief durations are two years for
inverters/batteries and twenty years for panels, not universal manufacturer claims.
Record commissioning separately from delivery.

Acceptance:

- Duplicate serials and insufficient stock are rejected; stock cannot be negative.
- Concurrent attempts to reserve one physical unit have one winner.
- Dispatch is rejected when required scanned units are missing or mismatched.
- A delivery retry does not duplicate movements/costs or extend warranty dates.
- Replacement preserves old/new equipment linkage, quarantine/return history and
  explicit coverage continuation; it never silently resets the warranty.

### 3.4 Field operations and installation

Provide mobile-friendly assigned job schedules and a digital job card recording
start/finish times, installed system size, component confirmation, checklist,
finished-roof photographs and customer signature.

Acceptance:

- Unauthorized technicians cannot access another technician's restricted job.
- Completion is blocked without valid times, confirmed size/components, required
  photos/checklist and signature evidence.
- Uploaded evidence is associated with the correct authorized job and persists
  after refresh; unsuccessful uploads cannot satisfy completion requirements.
- Installation time entries feed the technician pay summary and job costs once.

### 3.5 Support, warranty decisions and billing

Search by customer name, phone or exact hardware serial. Show installation and
service history alongside coverage. Save an explained decision containing the
unit, assessment date, coverage dates, policy/scope and reason.

Covered work charges the customer zero while recording actual material/labour
costs against the original installation. Track component coverage, service scope,
customer charge, internal cost and supplier claim/recovery separately. Expired or
otherwise chargeable work generates parts/labour billing through the finance
service. Warranty status alone must not erase exclusions or service-scope rules.

Acceptance:

- Coverage evaluates the saved policy and explicit date boundaries consistently.
- A covered repair can reduce job margin even when the customer owes zero.
- Chargeable repair invoicing and replacement stock/cost posting occur once.
- Resolution moves a ticket to awaiting customer confirmation; closure requires
  confirmer, channel and timestamp. Staff-recorded phone confirmation is labeled
  as such and does not pretend to be customer portal activity.

### 3.6 Management, finance and compliance

Provide today/week/month filters, installation profitability, open repairs,
unfinished steps, unpaid balances and invoices requiring action. Distinguish
invoiced revenue, cash received, estimated versus actual margin and unpaid work.

Record receipt costs, dispatched material costs, technician hours and frozen pay
rates, and service costs without double counting. Produce a pay summary rather
than full payroll. Track subsidy paperwork as milestones with owner, status,
dates and evidence; there is no live government integration or guaranteed award.
Support CSV export of relevant reports.

Acceptance:

- One completed installation plus a later repair reconciles to its posted
  invoices, actual material/labour/repair costs and receipts.
- Inventory purchase and dispatch consumption are not both expensed as the same
  job material cost; profit and cash remain distinct.
- Partial payments, open invoices and unfinished work stay visible.
- Subsidy paid to the customer is not reported as installer cash.
- Authorized exports agree with the filtered reports; financial corrections use
  explicit reversals rather than destructive edits.

## 4. Package catalogue

Seed complete 1-5 kW templates with quantities, units, prices and coverage policy:

- **On-Grid:** panels, connectors, wiring, inverter, wiring boxes, safety earthing,
  metal stands and the charge controller listed in the supplied brief.
- **Off-Grid:** the supplied component set plus battery storage.
- **Service:** fitting and testing, with explicit included/excluded service scope.

The On-Grid charge controller is a known ambiguity in the brief, not an assertion
about every real installation. Preserve the supplied evaluation template and keep
components configurable. Do not advertise universal subsidy eligibility or embed
unverified scheme/tax rules. See the [requirements interpretation](../research/solar/01-requirements-from-pdf.md).

## 5. Shared reliability and security requirements

- Critical stock, money and workflow effects share a database transaction.
- Mutation retries are idempotent; stale/conflicting changes fail explicitly.
- Validate inputs server-side through shared contracts; never trust browser totals
  or client-provided coverage decisions.
- Enforce role/record/file access, secure staff sessions and CSRF protection on
  authenticated mutations; validate and rate-limit public enquiries.
- Preserve actor/time/reason audit records for material transitions and corrections.
- Keep private evidence in authorized storage; never expose credentials or files
  through public asset URLs.
- Persist all final-demo business data in PostgreSQL. Loading/error/empty states
  must represent real outcomes; failures must not display fabricated success.
- Verify migration replay, application restart and a database/uploads backup
  restore before the final demonstration.

Detailed rules remain in the [data model](../architecture/data-model.md),
[API contracts](../architecture/api-contracts.md) and [testing plan](../planning/testing.md).

## 6. Priorities and differentiation

### P0: connected mandatory lifecycle

Enquiry -> approved survey -> frozen quote/BOM -> confirmed order and recorded
payment -> allocation -> scan/dispatch -> delivery/warranty -> evidence-backed
installation -> service assessment/repair -> customer-confirmed closure ->
reconciled reporting. Include subsidy milestones, pay summary and CSV.

Make the repair decision explain itself and show promised service scope in the
quote and ticket. These strengthen the required flow without adding another
product area.

### P1: after the core flow works

- A unified pending-work queue: next action, responsible person/party, due date
  and days waiting, including customer/company/DISCOM dependencies.
- A customer lifecycle timeline connecting sales, payment, fulfillment,
  installation, service and paperwork events.
- A downloadable handover pack containing serials, warranty dates, service scope,
  installation evidence and acceptance records.
- Catalogue/template editing and a customer confirmation link.

Basic unfinished-work visibility remains P0; the richer cross-module queue and
timeline are enhancements. These are product bets, not claims of exclusive
capabilities or proven competitor gaps; see [research proposals](../research/solar/06-solutions.md).

### Deferred

Customer portal, payment gateway, live WhatsApp integration, live government
integration, offline synchronization, multi-warehouse operation, full payroll,
roof simulation, AI diagnosis/chatbot and maintenance marketplace.

## 7. Ownership and delivery

- **D1:** all frontend UI, mobile interactions and API integration.
- **D2:** platform/auth, sales, finance writes, files, subsidy and release integration.
- **D3:** catalogue, inventory, fulfillment, warranty activation and migration coordination.
- **D4:** installation, service/coverage decisions and read-only reporting.

The [role document](../team/roles.md) remains authoritative for ownership. Backend
owners supply contracts and fixtures early. Follow the [relative execution plan](../planning/execution-plan.md)
and [demo/release plan](../planning/submission-and-demo.md); do not infer a verified
event deadline from the elapsed-hour schedule.

Release acceptance requires a persisted end-to-end demo, evidence of rejected
invalid transitions and safe retries, reconciled reports, mobile evidence capture,
clean startup instructions and contributions/presentation from the whole team.
