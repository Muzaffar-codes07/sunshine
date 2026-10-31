# D3 inventory and field contract handoff

Status: transport contracts and development fixtures only. They work with the owner-selected [stock ledger rules](data-model.md#stock-ledger-owner-decision-31-oct); runtime implementation is pending. No stock/field database migration, domain service, HTTP route, readiness preview or hardware validation is implemented by this slice. D1 owns all production UI; Tuhin owns D3, with Claude reviewing each slice.

## Dependencies and scope

This branch is based directly on main after [D2 catalogue PR #19](https://github.com/Muzaffar-codes07/sunshine/pull/19) landed. It replaces PR #22, whose catalogue branch was squash-merged. Only D3 files and appended exports differ from main; no catalogue commits or D4 preparatory models are included. Shared exact numeric schemas come from the merged catalogue. D3's earlier PR #8 dependency is removed.

D3 adds `inventory.ts`, `field.ts`, their exported inferred TypeScript types, and the examples in `packages/contracts/test/fixtures/d3.cjs`. Examples are for development/tests only; the application does not import them. The existing health, error, sales, auth and catalogue contracts remain available. D4 retains its own contracts in its separate PR.

## Planned command handoffs

Paths are planned interfaces, not existing routes. Staff identity comes from D2 auth, not request bodies. The service and database must enforce record-level access, transitions and integrity independently of these schemas.

| Planned consumer | Request schema | Service responsibility beyond transport validation |
|---|---|---|
| `POST /stock/receipts` | `receiveStockRequestSchema` | D2 canonical product/manufacturer/tracking; active authorized destination locationId; unique receipt reference/source; serialized count required when product is serialized; actual acquisition cost; no future event |
| `POST /orders/:id/allocations` | `allocateOrderRequestSchema` | Read frozen approved requirements/payment from D2; all-or-none allocation; lock ordering; no client BOM or paid flag |
| D4 ticket-parts helper | `reserveTicketPartsRequestSchema` / `allocationSourceSchema` | Canonical ticket line; quote-line XOR ticket-line source; correct job/customer; caller transaction |
| `POST /dispatches/:id/scans` | `recordScanRequestSchema` | Resolve authorized allocated physical unit; serial ambiguity; correct product; TYPED recorded but never sufficient for a required scan |
| `POST /dispatches/:id/dispatch` | `dispatchRequestSchema` | Recheck all required scans and reservation, stock/cost posting once, source uniqueness and idempotency |
| `POST /dispatches/:id/deliver` | `deliverDispatchRequestSchema` | `dispatch occurrence <= delivery occurrence <= server now`; actor recorded; D4 activation once in caller transaction, no second stock deduction |
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

`JobsService.ensureJob(tx, confirmedOrder)` will read canonical accepted order facts in the caller transaction and deduplicate by unique order ID. It waits for D2’s Order model and confirmation interface; there is no fake Order table, unguarded create-job endpoint or client-authored order snapshot.

D3 consumes D4’s single cost writer and warranty activation helper, passing the caller transaction and canonical source facts. Cost source identifiers must distinguish STOCK_MOVEMENT and installation TIME_RECORD; reversal gets a distinct reversal source. D4 must settle occurrence versus posting time before the cost helper is integrated. D3 never writes CostEntry or Warranty directly.

400 errors keep `{error:{code,message,fieldErrors,requestId}}`. D2’s shared 409 nesting is now `error.reasons?: [{code,reason,source,nextAction}]` and is included in this catalogue base. D3 consumes the shared `refusal(...)` helper and adds its database-rule mappings with its actual migrations; it does not publish an alternative error envelope. No extra readiness-preview endpoint is added.

## Verification and remaining gates

Eighteen D3 schema tests cover duplicate serials, exact quantities/costs, whole-unit counts, XOR allocation sources, physical-unit quantity, client-owned fields, typed-scan representation, negative availability reporting, quarantine/replacement, crew/schedule validation, evidence/time/capacity and timezone-aware instants. Existing contract tests also run. These tests validate transport contracts only; they do not prove authorization, stock concurrency, delivery activation, ledger queries, uploads or scanner behavior.

Before runtime acceptance: implement the confirmed ledger specification; land D2 catalogue/order/files; agree D4 source/cost/warranty helpers; implement D3 schema and commands through the queue; run real PostgreSQL races/retries and real-device checks; then connect D1 UI. Required baseline workflows remain incomplete until that evidence exists.

### Review clarifications

Time records must be contained in the installation interval and cannot overlap for the same technician. Adjacent intervals are allowed and different technicians may work concurrently. The service repeats these checks and deduplicates durable sources; transport validation is not pay posting. Capacity is a whole-number 1–5 kW confirmation matching the current D2 enquiry/package contract; fractional package capacity requires a coordinated later contract change.

`returnUnitRequestSchema` is D4’s ticket-linked serialized-unit convenience input. `returnStockRequestSchema` additionally covers unused installation equipment and fractional bulk from an issued allocation, or parts from a ticket line. Both feed one canonical return service, rather than competing stock writers. Only authorized staff may return inspected unused equipment to usable stock; an old replaced/faulty unit must be quarantined, even if a request says RETURN_TO_STOCK. Returnable quantity cannot exceed the net issued amount, and D4’s agreed reversal source must prevent double credit.

Receipt timestamps must be nonfuture at the server; delivery must be between dispatch occurrence and server now. A zero acquisition cost is accepted only with an explicit recorded zeroCostReason and service authorization, never a silent default; final source/cost audit belongs to the receipt service. The fixture dates do not prove these clock-based service rules. All seed IDs must be RFC-valid UUIDs; repeated-character placeholders may be rejected by z.uuid().
