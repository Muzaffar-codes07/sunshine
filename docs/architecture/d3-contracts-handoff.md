# D3 inventory and field contract handoff

Status: shared contracts plus implemented inventory receipts, stock reads, serial traceability, order reservations/release, job creation/scheduling and dispatch draft/scan services. They follow the owner-selected [stock ledger rules](data-model.md#stock-ledger-owner-decision-31-oct). Installation start/completion with evidence and time records is implemented by #48; dispatch cost/issue posting and delivery activation from frozen quote terms are implemented by #60. Repair-ticket stock, labour cost posting and the production quote-policy reader remain incomplete. D1 owns production UI and actual-device acceptance; Tuhin owns D3. Codex currently works independently under the owner's instruction.

## Dependencies and scope

Historical contract publication: PR #28 was based on main after [D2 catalogue PR #19](https://github.com/Muzaffar-codes07/sunshine/pull/19), replacing PR #22 after its catalogue base was squash-merged. Runtime slices subsequently added their real models, migrations and services. Shared exact numeric schemas come from the catalogue; D4’s cost/ticket/warranty foundation is merged via #8; its production adapters and policy configuration remain separately gated.

D3 adds `inventory.ts`, `field.ts`, their exported inferred TypeScript types, and the examples in `packages/contracts/test/fixtures/d3.cjs`. Examples are for development/tests only; the application does not import them. The existing health, error, sales, auth and catalogue contracts remain available. D4’s shared contracts are now on main via #8.

## Implemented and planned command handoffs

This table includes implemented and planned interfaces; the inventory/field READMEs state runtime coverage. Staff identity comes from D2 auth, not request bodies. The service and database enforce record-level access, transitions and integrity independently of transport schemas.

| Planned consumer | Request schema | Service responsibility beyond transport validation |
|---|---|---|
| `POST /stock/receipts` | `receiveStockRequestSchema` | D2 canonical product/manufacturer/tracking; active authorized destination locationId; unique receipt reference/source; serialized count required when product is serialized; actual acquisition cost; no future event |
| `GET /stock/receipts/:id` | `stockReceiptResponseSchema` | WAREHOUSE/ADMIN reload immutable original receipt costs, zero-cost reasons, actor/dates and movement/unit IDs; other document kinds and unknown IDs return 404 |
| `GET /units/:id` | `unitDetailResponseSchema` | WAREHOUSE/ADMIN trace stable identity to receipt, physical location and active allocation/job/order/customer IDs in one snapshot; unknown UUID returns 404 |
| `POST /orders/:id/dispatches` | `createDispatchRequestSchema` → `dispatchResponseSchema` | WAREHOUSE/ADMIN, key and expected job version; paid complete reservation on an unstarted order; one retained DRAFT per order |
| `GET /dispatches/:id` | `dispatchResponseSchema` | Snapshot of the draft, current allocations and retained scans; scanReadiness.complete is not dispatch or cost posting completion |
| `POST /orders/:id/allocations/release` | `releaseOrderAllocationsRequestSchema` → `releaseOrderAllocationsResponseSchema` | WAREHOUSE/ADMIN; Idempotency-Key; expected job version and reason; complete RESERVED set on an unstarted job only; retains row audit, frees units, no stock/payment movement |
| `POST /orders/:id/allocations` | `allocateOrderRequestSchema` | Read frozen approved requirements/payment from D2; all-or-none allocation; lock ordering; no client BOM or paid flag |
| D4 ticket-parts helper | `reserveTicketPartsRequestSchema` / `allocationSourceSchema` | Canonical ticket line; quote-line XOR ticket-line source; correct job/customer; caller transaction |
| `POST /dispatches/:id/scans` | `recordScanRequestSchema` → `dispatchResponseSchema` | Implemented: key, canonical current allocated unit, raw/normalized value, actor/time, ambiguity refusal, immutable history; TYPED never sufficient; released allocation scans never reused |
| `POST /dispatches/:id/dispatch` | `dispatchRequestSchema` → `dispatchResponseSchema` | Implemented: key and version; rechecks scans and reservation under locks; one DONE issue document, one movement per allocation and `MATERIAL_DISPATCH` costs, in one transaction |
| `POST /dispatches/:id/deliver` | `deliverDispatchRequestSchema` → `dispatchResponseSchema` | Implemented: `dispatch occurrence <= delivery occurrence <= server now`; actor recorded; calls D4's activation helper once, in the same transaction; no second stock deduction. `coverage` marks a unit `NO_POLICY` when the quote froze no terms |
| D4 ticket-linked unit return/replacement helpers | `returnUnitRequestSchema`, `replacementStockRequestSchema` | Linked ticket, actual old/new units, authorized return-to-stock; default faulty-unit return is quarantine; distinct physical replacement; D4 owns coverage continuation |
| General unused-equipment / bulk return helper | `returnStockRequestSchema` | Canonical issued allocation or ticket line, actual product/unit, remaining returnable quantity, role checks and source-specific cost reversal |
| `POST /jobs/:id/schedule` | `scheduleJobRequestSchema` | Active TECHNICIAN assignees, job record authorization and schedule policy |
| `POST /jobs/:id/start` | `startInstallationRequestSchema` | Assigned staff, eligible job/payment/material state, nonfuture time |
| `POST /jobs/:id/complete` | `completeInstallationRequestSchema` | Matching installed system/package, valid nonfuture crew time, persisted authorized private photos/signature, all required package checks, cost posting once |

Only allocation `RESERVED` quantities reduce free stock; the final domain service must separately retain the exclusive physical-unit assignment through dispatch/delivery/installation. Contracts do not implement either rule. The runtime follows the owner-selected derived-ledger specification on main; transport contracts do not implement that ledger.

## Identity, quantities and evidence

- Equipment identity is canonical manufacturer + product + normalized serial, backed by a stable unit UUID. Manufacturer comes from the authoritative D2 catalogue/product facts: `unitViewSchema` requires its `manufacturerId` UUID and includes `manufacturer` as a display label. D3 does not create another manufacturer entity. Trim + uppercase normalizes serials; punctuation and internal characters are preserved, with original scan/receipt input retained separately. A receipt rejects repeated normalized serials for its product across lines. Final database uniqueness still applies across receipts.
- Exact numeric strings use the shared `numeric(14,2)` money and `numeric(12,3)` quantity formats. No binary floating arithmetic for costs. A serialized allocation represents quantity one. Receipt serial counts match a whole quantity when serials are provided; only the service knows whether serials are mandatory for a product.
- Stock summaries expose exact-string onHand/reserved/free plus asOf. A negative free value represents a shortage for the service to handle; never clamp it into a successful availability result. Schema acceptance is not authority to allocate negative stock.
- Client mutation bodies are strict: they cannot supply customer/actor authority, cost totals, a BOM/payment flag or a countsForDispatch override. Optional unit IDs only request a selection; the service verifies allocation/product identity.
- Event inputs require a timezone (`Z` or offset). Services persist UTC instants. Warranty calendar dates remain D4’s IST policy concern. Delivery-before-dispatch and future-delivery examples in the fixture file require real service tests; parsing a timestamp is not proof of the time guard.
- Photos and signatures must have separate persisted file IDs. The service verifies correct record association, type/size and visibility through D2’s file service. Pending, orphan or failed uploads never satisfy completion. No certified-signature or actual-photograph authenticity claim.

## Shared helper and error boundaries

`JobsService.ensureJob(tx, confirmedOrder)` reads canonical accepted order facts in the caller transaction and deduplicates by unique order ID. It is wired into D2's actual order confirmation, with one job/order relation and rollback tests; no client-authored order snapshot is accepted.

D3 consumes D4’s single cost writer and warranty activation helper, passing the caller transaction and canonical source facts. Cost source identifiers must distinguish STOCK_MOVEMENT and installation TIME_RECORD; reversal gets a distinct reversal source. The merged helper requires occurrence time and separately records posting audit time; dispatch supplies each canonical stock movement occurrence. D3 never writes CostEntry or Warranty directly.

400 errors keep `{error:{code,message,fieldErrors,requestId}}`. D2’s shared 409 nesting is now `error.reasons?: [{code,reason,source,nextAction}]` and is included in this catalogue base. D3 consumes the shared `refusal(...)` helper and adds its database-rule mappings with its actual migrations; it does not publish an alternative error envelope. No extra readiness-preview endpoint is added.

## Verification and remaining gates

The original eighteen D3 schema tests cover serials, exact quantities/costs, allocation sources, scan methods and field input. Later tests add runtime receipt/stock/reservation/traceability and draft/scan evidence cases; see the inventory README and issue #13 for head-pinned execution results. Contract tests alone do not prove authorization, concurrency, delivery activation, uploads or physical scanner support.

Dispatch/delivery and private-file integration are implemented. Remaining acceptance: authoritative quote-policy configuration for real warranty activation, actual repair/return adapters, installation labour costs with frozen rates, and D1 UI/physical-device checks. Verify each command’s PostgreSQL races/retries and financial reconciliation against its recorded source head. A draft with complete scan evidence is still not dispatched. Required baseline workflows remain incomplete until these gates have evidence.

D2 private files now use the D3 JOB access adapter: actual order/quote/enquiry/customer checks, current assignment, role matrix, completed-job write freeze and caller-transaction Job-before-File locking. TICKET remains unconfigured. Installation start/completion, photo/signature associations and byte/evidence gates were subsequently implemented in #48. Labour cost posting remains dependent on D4; start now requires DELIVERED equipment via #60; dispatch/delivery/installation do not deduct stock twice. Production UI and actual-device acceptance remain separate.

### Review clarifications

Time records must be contained in the installation interval and cannot overlap for the same technician. Adjacent intervals are allowed and different technicians may work concurrently. The service repeats these checks and deduplicates durable sources; transport validation is not pay posting. Capacity is a whole-number 1–5 kW confirmation matching the current D2 enquiry/package contract; fractional package capacity requires a coordinated later contract change.

`returnUnitRequestSchema` is D4’s ticket-linked serialized-unit convenience input. `returnStockRequestSchema` additionally covers unused installation equipment and fractional bulk from an issued allocation, or parts from a ticket line. Both feed one canonical return service, rather than competing stock writers. Only authorized staff may return inspected unused equipment to usable stock; an old replaced/faulty unit must be quarantined, even if a request says RETURN_TO_STOCK. Returnable quantity cannot exceed the net issued amount, and D4’s agreed reversal source must prevent double credit.

Receipt timestamps must be nonfuture at the server; delivery must be between dispatch occurrence and server now. A zero acquisition cost is accepted only with an explicit recorded zeroCostReason and service authorization, never a silent default; final source/cost audit belongs to the receipt service. The fixture dates do not prove these clock-based service rules. All seed IDs must be RFC-valid UUIDs; repeated-character placeholders may be rejected by z.uuid().

Unit traceability additionally returns nullable `replacesUnitId`. This field is persisted predecessor history, not evidence that a replacement workflow ran. Existing/received units return null. Internal future replacement writers use READ COMMITTED and the documented Product/stock/sorted Unit lock order before recording an edge; database guards refuse missing/self/cyclic/rewritten predecessors. No client setter is exposed. D4’s replacement stock adapter and continued coverage remain gated by actual repair-ticket/stock integration, separately from implemented new-sale dispatch/delivery.
