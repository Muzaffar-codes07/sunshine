# Product Design Requirements — Sunshine

This PDR covers the product-design side of the requested foundation documents. The [PRD](PRD.md) defines what and why; [TRD](TRD.md) defines implementation. Status: planned interaction specification, not implemented screens.

## 1. Design objective

One coherent workspace answers: “what customer/job is this, where is it blocked, who acts next, and what evidence supports the next action?” Avoid independent admin pages that hide the relationship between an enquiry, equipment and ticket.

## 2. Information architecture

| Navigation | Primary contents | Default view |
|---|---|---|
| Overview | Assigned work, blocked jobs, open repairs, outstanding invoices | Action queue, not decorative KPI cards |
| Sales | Enquiries, qualification, surveys and follow-ups | Filtered list plus detail drawer |
| Orders | Lifecycle, approved survey, quote/BOM, invoice/receipt and fulfillment | Customer/order workspace |
| Warehouse | Stock/units, receipts, allocation, scans, dispatch/delivery | Work queue with availability |
| Field & Service | Assigned jobs, completion/evidence, serial lookup and tickets | Mobile job card or ticket detail |
| Reports | Period activity, lifetime job contribution, receivables, pay/subsidy and CSV | Explicit scope/date filter and reconciliation table |

Order detail tabs: Overview, Survey, Quote/BOM, Money, Equipment, Field Evidence, Service. Keep customer/job ID, current state, owner and next permitted action visible. Links to equipment/tickets preserve the current customer context.

## 3. Six reusable patterns

1. Filterable list: search, status/owner filters, pagination, clear empty state.
2. Record detail: identity, status, relationships and recent audited actions.
3. Validated form: required fields, inline errors, summary focus and retained input after failure.
4. Timeline: state/evidence/actor/time, clearly different planned and completed events.
5. Action drawer: action summary, required evidence, confirmation and server result.
6. Summary plus table: labeled amounts, period/scope, source links and matching export.

D1 owns all production UI. Backend owners supply schemas, examples and integration slots. D2 provides limited emergency UI rescue only if a checkpoint is missed and D1 coordinates it. Do not silently add two more frontend developers.

## 4. Interaction requirements

| Flow | Required behavior | Failure/empty state |
|---|---|---|
| Enquiry | Validate contact, record source, submit and navigate to persisted ID | Field errors; no success toast on failed write |
| Survey | Show qualification and measurements; distinguish draft/submitted/approved revision | Quote gate explains missing approval; API still enforces it |
| Quote/BOM | Show selected package, priced lines and all stock requirements | Unknown/missing component is unresolved, not zero or omitted |
| Order/payment | Separate customer acceptance, confirmation, invoice and receipt | Pending balance/readiness comes from API; no fake payment success |
| Allocation | Show available quantity, actual selected serials and requirement match | Specific shortage/conflict without partial reservation |
| Scan/dispatch | Show required units, normalized serial, method and accepted/rejected result | Wrong/unknown/already-assigned/missing scan explains next action |
| Field completion | Mobile time/kW/checklist/photo/signature with clear upload status | Pending/failed file is not evidence; missing fields prevent completion |
| Ticket | Unit/customer/dates/policy/reason, customer charge, internal cost, supplier claim separately | Ambiguous coverage requests review; resolved differs from confirmed/closed |
| Report | Scope/date/cutoff visible; click amount to source rows | No unexplained global total; zero results remain honest |

No duplicated stock/coverage/finance formulas in the browser. Treat mutation results as authoritative, invalidate relevant queries, and re-fetch. Do not optimistically change stock or money. Poll active queues only where useful.

## 5. Visual and accessibility requirements

Use one accent, neutral surfaces and semantic success/warning/error colors. Text accompanies color. Shared spacing/type/control sizes; visible focus, semantic labels, keyboard operation, approximately 44px mobile touch targets and adequate contrast. Use a 360px-wide layout without horizontal form overflow. Loading, empty, permission-denied, disconnected and retry states are real designs, not afterthoughts.

Photos/signatures need preview and persisted status; scan input needs raw/normalized values and a non-camera fallback. Do not claim geolocation or authenticity checks that do not exist. Signature is acceptance evidence, not a certified e-signature product.

## 6. Design/build order and review

Begin with shell/patterns and contract forms. Spike actual available scan/photo/signature capabilities early; integrate the risky controls before dashboard polish. Build sales/order workspace, warehouse, field/service, reports, then domain-specific integration and final accessibility pass. Use the resource-leveled [backlog](planning/build-backlog.json), not an expectation that D1 builds nineteen unique screen designs independently.

At UI review: submit an invalid form, inspect a failed request, refresh after success, use keyboard focus, resize to phone width, inspect the current record's traceability and confirm no fixture-only runtime data. A claim of phone usability requires a real device path; desktop emulation is a disclosed fallback.

## 7. Presentation design

Use one operator and short explanations from all four developers. Current record identity and seeded-history labels stay visible. The three-minute script uses prepared stages and real writes; the longer walkthrough proves the full new-customer chain. Do not add a hidden demo-complete button or silently jump to unrelated records after failure. Refer to [the operator runbook](planning/demo-runbook.md) for actual device, barcode, timing and recovery acceptance.
