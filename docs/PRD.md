# Product Requirements Document — Sunshine

Revision: 31 October 2026. Product: Solar Installation Management System for fictional SunPower Solutions. Status: **requirements baseline and implementation plan; business capabilities are not built yet**. Technical implementation belongs to [TRD](TRD.md); interaction design belongs to [PDR](PDR.md).

## 1. Problem and intended outcome

The [authoritative PDF](requirements/solar-problem-statement.pdf) describes roughly 40 rooftop jobs/month and 15 technicians using fragmented enquiries, quotations, site registers and equipment records. The product connects the complete installation and service lifecycle so staff can identify what must happen next, which physical unit a customer owns, whether service is covered, and which jobs made or lost money.

This fictional scenario is a requirement source, not proof of market-wide product failure. The [market research](research/solar/README.md) finds strong incumbent coverage and published operational pain; our solution benefits and competitor gaps remain hypotheses without interviews or product trials.

## 2. Users and responsibilities

| User | Need | Principal permitted actions |
|---|---|---|
| Sales coordinator | Avoid lost enquiries and incomplete quotes | Capture/qualify/follow up; schedule survey; prepare quote/order; record accepted terms |
| Survey approver | Know quotation follows verified site information | Review measurements; approve/reject a survey revision |
| Warehouse operator | Pack correct available units and preserve serial traceability | Receive stock, allocate, scan, dispatch, record delivery |
| Technician | See assigned work and record proof | Read assigned jobs, enter time/kW/checklist, upload photos, capture customer signature |
| Support | Resolve the correct equipment issue and explain charges | Lookup unit/customer/coverage; assess, repair/replace and record customer confirmation |
| Director | See unfinished work, receivables and job results | Read operational/financial reports and exports; approve authorized overrides |

Staff roles are implementation controls, not six separate products. A single person may perform multiple functions with explicit permissions and audit actor information. A public enquiry form is the only unauthenticated business entry point; it needs validation and rate limiting.

## 3. Product goals and acceptance measures

- A new enquiry reaches the sales queue, persists after refresh and has an owner/follow-up.
- No quote can be created from an unapproved survey; a selected package supplies all required parts.
- Confirmation produces one order/job/invoice/packing requirement; payment is recorded once and gates work.
- One physical serial cannot satisfy two active jobs. Every required serialized unit is scanned before dispatch.
- Delivery activates each warranty once; support can retrieve the unit/customer/policy/dates together.
- Installation cannot complete without valid time, kW, photograph and signature evidence.
- Covered repairs charge the customer zero while preserving actual company cost; expired/no-service cases produce parts/labour billing.
- Resolution alone does not close a ticket; customer confirmation is required.
- Job contribution, invoices, receipts, pending work, subsidy milestones and technician pay reconcile to posted records and can be exported.

Future usability targets on the agreed demo dataset: enquiry visible within 3 seconds on the local network; normal record lookup within 2 seconds; explicit validation errors without lost form input. These are acceptance targets to measure, not current benchmark claims.

## 4. Required lifecycle and scope

Enquiry → Qualification → Survey/Approval → Quote/Frozen BOM → Acceptance/Order → Payment → Allocation → Scan/Dispatch → Delivery/Warranty → Installation/Acceptance → Service → Reporting.

| Requirement group | IDs | P0 acceptance |
|---|---|---|
| Intake, follow-up and approved site facts | R1–R4 | Contact and qualification validated; survey measurements and approval revision saved |
| Package pricing/components and fulfillment trigger | R5–R9 | Complete immutable quote; one job/packing requirement; receipt and balance accurate |
| Physical equipment and warranties | R10–R12 | Actual scans and customer association; per-unit delivery dates/expiry |
| Field proof | R13–R15 | Valid timestamps/kW, real uploaded sample photograph and signature |
| Support and repair | R16–R19 | Correct saved coverage decision, free/charged repair or replacement, customer-confirmed closure |
| Director and sharing | R20–R25 | Contribution/unfinished work, invoices, subsidy, technician pay, periods/open repairs and CSV |

Accountable owners under the owner-selected [role division](team/role-division-brief.md). D1 builds the UI for every row. The owner columns in [the traceability matrix](planning/requirements-traceability.csv) are superseded by this table until reconciled; its tickets, proof and PLANNED status still apply. No requirement is silently reclassified as optional.

| Rows | Accountable backend owner | Supporting |
|---|---|---|
| R1–R8 | D2 | D3 (packing needs from R8) |
| R9 | D3 (job helper) | D2 calls it at confirmation |
| R10–R11 | D3 | |
| R12 | D3 (delivery) | D4 (warranty activation helper) |
| R13–R15 | D3 | D2 (file transport) |
| R16–R19 | D4 | D3 (stock, replacement primitives), D2 (chargeable invoice) |
| R20 | D4 | |
| R21 | D2 (invoices, receivables) | D4 (report view) |
| R22–R25 | D4 | D3 (installation time for R23) |

## 5. P0/P1/P2 boundaries

P0 uses simple forms/tables, seeded but editable-through-normal-workflow records, one warehouse, manual receipt recording, a printable management invoice, staff-recorded customer confirmation, queryable subsidy milestones, pay summary and CSV. Required scanning is actual camera/scanner input; typing is a disclosed fallback, not proof of scan support.

P1: catalogue/template editors, richer service policy scope, customer-held handover pack, remote confirmation link, better search/bulk entry. P2: offline synchronization, service reserve and preventive scheduling. Excluded from the build: AI diagnosis/chatbot, marketplace, roof engineering simulation, live DISCOM/WhatsApp/payment integration, multi-warehouse optimization and full payroll.

## 6. Business definitions

Prices/parts originate in versioned package definitions. Accepted quotes freeze quantities, prices, inclusions and relevant policy facts. Package/component/service lines prevent double charging. Actual inventory allocation remains distinct from template components.

Invoice activity is not the same as cash received or completed-job profit. Use explicitly labeled period invoice/cash/cost activity and lifetime job contribution as of a cutoff. An unfinished order cannot appear as a completed-job profit. Subsidy expected/approved/received stays separate; a subsidy paid to the customer is not company cash.

Coverage needs start/expiry/policy/scope and a saved decision. Supplier claim, internal cost and customer charge are different facts. Do not assert current legal subsidy/tax rules from old draft guidance. Replacement coverage continuation is an explicit assumption until policy is confirmed.

## 7. Assumptions, ambiguities and decisions

- One company/warehouse. The original hackathon baseline was staff-only; the
  1 November customer-portal extension adds verified-email customer accounts
  and customer-scoped read pages, plus authenticated contact edits. Customers
  still cannot submit service requests or payments in the portal.
- Calls/WhatsApp are manually recorded sources; payments are recorded, not gateway processed.
- Follow the PDF's fictional package catalogue, including its on-grid controller listing; do not present it as engineering advice.
- Panels are also serialized to support their specified warranty; delivery and commissioning are separate dates.
- Customer repair confirmation can be recorded by staff with confirmer/channel/time; never imply the customer authenticated when they did not.
- Event rules come from the event page for 69158, captured 31 Oct (`docs/requirements/hackathon-requirements.md`, added in PR #1); see section 11. The event page lists the ability to design backend APIs, model data and set up a local database as nice-to-have. No BaaS and minimal third-party APIs come from the [2025 organizer video](requirements/organizer-video-deliverables.md), not the event page. The team has adopted all of these as mandatory (ADR-03). The video submission is required by the event page's timeline.
- One dedicated frontend owner and three component-based backend owners (owner decision, 31 Oct). All code is written fresh for Sunshine; no source is copied from earlier projects.
- Stack: keep the existing React/Vite + NestJS + Prisma + PostgreSQL scaffold (decision M1, see [TRD](TRD.md) section 1).
- Feature-report upgrades: only minimal refusal reasons and command readiness guards are in scope. The exception queue, cost variance, second-person installation check and every other enhancement are deferred. They can be reopened only after R1–R25, device and release checks pass, and before 01 Nov 05:00.

See [decision/assumption register](foundations/decisions-and-assumptions.md). Only the owner/organizer can settle external restrictions or team assignments.

## 8. Presentation and product success

The [short presentation](planning/demo-runbook.md) introduces prepared records honestly and performs selected live transitions. The full evaluator walkthrough proves a new customer through every required scene. Multiple prepared records must not be claimed as one newly created customer. Synthetic history and example figures remain labeled, and every live outcome comes from real APIs/PostgreSQL.

Success is connected behavior, integrity, explainable decisions and a rehearsed presentation. It is not the number of screens, an untested scalability claim, market validation, or a guarantee of winning.

## 9. Definition of product acceptance

Every R row has actual feature/test evidence; the complete workflow survives refresh; invalid inputs/transitions/access fail safely; concurrency and retry tests pass on real PostgreSQL; required evidence persists; actual financial queries match the oracle; scanner/device limitations are explicit; clean startup and recovery are rehearsed; all four members contribute and explain their parts. Today only scaffold checks exist; this acceptance remains future work.

## 10. Customer communication, privacy and unhappy paths

The customer sees system size and actual installed serials before signing and can receive a printable completion summary. This is baseline clarity; a richer portable handover pack remains P1. Quotes/invoices have a printable/shareable document view; staff sends them manually and records sent time/channel. No automated email/WhatsApp delivery is claimed. An enquiry can be archived/closed with reason, not silently deleted; unactioned age and owner stay visible.

Admin represents the director in the staff role enum. Sales edits intake/survey/quote/order; warehouse changes stock/dispatch; technicians see assigned jobs; support changes service tickets; admin sees reports/authorized overrides. Finance posting needs an explicit permission; being able to view an order does not authorize recording payments. The public homeowner only submits an enquiry in P0; signatures/phone confirmations do not imply a customer account.

| Unhappy path | P0 behavior / explicit limit |
|---|---|
| Roof unsuitable or survey rejected | Save reason, keep enquiry/follow-up, no quote until a new approved revision |
| Quote declined/revised | Record declined; new version for changes; accepted facts not overwritten. Automated expiry is deferred |
| Cancel after advance | Preserve order/payment history; authorized reversal/refund record with external reference, never imply money was returned by a gateway. Detailed refund automation is deferred |
| Stock shortage/partial or failed delivery | Leave pending/failed with reason and next owner; no partial dispatch/delivery in P0 and no false warranty start |
| Homeowner absent/refuses signature | Keep awaiting acceptance, retain draft/evidence and follow-up; do not force completion |
| Job reassigned | Authorized recorded change; original time/evidence actors retained |
| Customer unreachable after repair | Awaiting customer confirmation remains open |
| Closed issue recurs | Create linked follow-up ticket; no destructive reopening/history rewrite in P0 |
| Serial unknown/wrong | Record needs-review ticket; do not infer coverage. Allocated/installed serial identity cannot be edited casually |

Use English UI, INR with Indian digit grouping and explicit IST date labels. Retain in-memory form/signature input after a failed request and reuse idempotency key; full offline/reload persistence remains P2. Public form states the purpose of contact-data collection. Private photos/signatures/addresses do not appear in public listings, logs or default financial CSV; the demo uses synthetic people and licensed/team-created sample images only.


## 11. Event delivery constraints

Source: event page 69158, captured 31 Oct 2026 (`docs/requirements/hackathon-requirements.md`, added in PR #1). Times are assumed IST; the page prints no timezone.

| When | Required |
|---|---|
| 31 Oct 11:00 | Evaluator added as GitHub collaborator (missed; a repo admin must fix it now) |
| As soon as possible | Repository link submitted on the portal |
| 01 Nov 10:00 | Coding ends |
| 01 Nov 10:30 | Video links submitted. Length, format and hosting are not stated; ask the helpdesk |
| 01 Nov 13:00 | Presentation. Duration is not stated; the three-minute pitch is our assumption |

Event MUSTs and how this product proves them:

| Event MUST | Acceptance in this product |
|---|---|
| Dynamic data, no static JSON in the final app | Every screen reads persisted PostgreSQL data through our APIs. Production business routes use no fixture or mock providers and no static JSON. Explicitly seeded PostgreSQL demo records are allowed and labelled |
| Responsive, clean UI with consistent colours and layout | Six shared page patterns; forms usable at 360px; field flow tested on a real phone |
| Robust input validation | Shared Zod schemas on client and server; field errors without losing input; invalid transitions return a 409 with a reason |
| Intuitive navigation and menu placement | Six top-level areas (Overview, Sales, Orders, Warehouse, Field & Service, Reports), each showing the current status and next action |
| Proper Git use by the whole team | Each of the four members commits their own component work through small reviewed PRs |
