# Issue 44: D4 service and reports frontend handoff

Current remaining-work implementer/reviewer: **Tuhin/Codex**, following Tuhin's explicit D1/D4 takeover instruction. Original service/report component contribution: Bhanu (`@vbtgongithub`); original D1 owner: Nirmayi (`@3upho`). These names retain credit and are no longer availability or approval dependencies. #66 integrated the production routes and saved-ticket reads; #69 activated persisted financial and operational reporting.

## Current components

- `ServiceWorkspaceRoute` — persisted ticket listing/filtering/pagination and refreshable detail links.
- `ServiceWorkspacePage` — serial lookup, saved policy/coverage/lineage display and prepared ticket lifecycle forms.
- `ReportsWorkspacePage` — IST period overview, job profitability, technician pay, subsidy milestones and CSV download handling.
- Existing shared patterns and `Field` are consumed without editing them. Routes, navigation and shared styling are integrated; remaining edits and review belong to the takeover.

## Host integration

Use these exports within the authenticated workspace and its query provider after the production API gates below are met:

```tsx
import { ServiceWorkspaceRoute } from '../features/service/ServiceWorkspaceRoute';
import { ReportsWorkspacePage } from '../features/reports';
```

Mount the service page at a dedicated service child route that does not replace D3's field/job screen. Mount the reports page under the reports workspace. Leave `ticketCommandsEnabled` at its default `false` until the ticket APIs below are completed. Saved-ticket and financial/operational reads are live; warranty lookup and ADMIN future-policy editing are connected in the takeover candidate; ticket writes retain their explicit activation gates.

For review without changing shared routes, start the web server (for example `npm run dev -w @sunshine/web -- --port 5187`) and open `/test/d4-preview.html`. The preview uses the real API proxy with no success fixtures and leaves writes disabled. Production builds do not include that HTML entry.

## Stable synthetic scenario identifiers

These identifiers come from `buildD4Scenarios()` in `prisma/seed/d4-demo-scenarios.ts`. They are fixed across preview runs; installation and expiry dates are relative to the seed's IST reference date. **They are not persisted demo records.** `npm run db:seed -- --preview` prints `persisted: false`, and ordinary D4 seeding currently exits with `D4_SEED_INTEGRATION_REQUIRED` before writing anything. Do not use these IDs as proof that a production lookup or report exists.

| Scenario | Serial | Customer ID | Job ID | Unit ID | Ticket ID |
|---|---|---|---|---|---|
| Covered inverter, Anita Sharma | `INV-ACTIVE-2025-01` | `d4510000-0000-4000-8000-000000000011` | `d4510000-0000-4000-8000-000000000021` | `d4510000-0000-4000-8000-000000000031` | `d4510000-0000-4000-8000-000000000051` |
| Expired battery, Rajesh Verma | `BAT-EXPIRED-2024-09` | `d4510000-0000-4000-8000-000000000012` | `d4510000-0000-4000-8000-000000000022` | `d4510000-0000-4000-8000-000000000032` | `d4510000-0000-4000-8000-000000000052` |

## Request, response and error examples

These are **contract examples with synthetic facts**, not recordings of successful production calls. The frontend validates complete responses with `@sunshine/contracts` and refuses malformed or unavailable results.

`GET /api/v1/warranties/lookup?serial=INV-ACTIVE-2025-01` accepts optional `manufacturerId` and `productId` UUIDs when a serial is ambiguous. Example response for a 31 Oct 2026 IST reference date:

```json
{"data":{"unit":{"id":"d4510000-0000-4000-8000-000000000031","serial":"INV-ACTIVE-2025-01","manufacturerId":"11111111-1111-4111-8111-111111111111","productId":"22222222-2222-4222-8222-222222222222"},"customer":{"id":"d4510000-0000-4000-8000-000000000011","name":"Anita Sharma"},"job":{"id":"d4510000-0000-4000-8000-000000000021"},"assessment":{"unitId":"d4510000-0000-4000-8000-000000000031","serial":"INV-ACTIVE-2025-01","asOfDate":"2026-10-31","policyName":"Demo inverter policy","policyRevision":"demo-v1","scope":"Component replacement","startDate":"2025-04-30","expiryDate":"2027-04-30","coverageStatus":"COVERED","isCovered":true,"reason":"Under active manufacturer/installer warranty","customerCharge":"0.00","chargeStatus":"FREE"}}}
```

Ticket command bodies are strict; the browser supplies no customer, job, coverage or price override. Create uses `POST /api/v1/tickets`:

```json
{"unitId":"d4510000-0000-4000-8000-000000000031","faultDescription":"Inverter fault"}
```

```json
{"version":1,"asOfDate":"2026-10-31T10:00:00.000Z","requestedScope":"Component replacement"}
```

`resolve` uses `{version, resolutionDetails}`; `confirm` uses `{version, confirmerName, channel, confirmedAt, notes?}`. Timestamps are transmitted with an explicit offset. Device-local datetime fields are labeled as such. `ServiceTicket` responses contain the saved `version`, `assessmentSnapshot`, nullable `replacedUnitId`/`newUnitId`, resolution facts and nullable customer confirmation. For an OPEN ticket, those later facts are `null`; the UI does not infer closure or zero charge from status alone. POST commands remain unavailable in production until server replay and authorization are wired.

An invalid serial field produces the standard 400 envelope, for example:

```json
{"error":{"code":"INVALID_INPUT","message":"Some fields need attention","fieldErrors":{"serial":["Enter a serial number"]},"requestId":"33333333-3333-4333-8333-333333333333"}}
```

An absent/expired session returns 401; a verified session without the required role returns 403. A stale ticket version returns 409 `STALE_VERSION` and must be reloaded before a new action. Some 409 responses also include `error.reasons[]` with `reason`, `source` and `nextAction`; the UI shows them when supplied. Warranty lookup validates real delivery/frozen-policy evidence. Corrupt sources return 503 `INVALID_WARRANTY_RECORD`; a replacement pointer without verified issue/billing remains 503 `WARRANTY_REPLACEMENT_UNAVAILABLE`. Unknown serials return 404 and ambiguous serials return 409; unsupported roles never receive customer facts.

Report reads are `/reports/overview?period=today|week|month`, `/reports/pay-summary?period=...`, `/reports/profitability?jobId=<UUID>` and `/reports/subsidies`. For the synthetic covered job, the profitability URL would be `/api/v1/reports/profitability?jobId=d4510000-0000-4000-8000-000000000021`. This URL is an identifier handoff, not a claim that posted finance facts exist. CSV uses `/reports/export.csv?report=overview|pay&period=...` or `report=profitability&jobId=...`. A CSV success is `text/csv` with a fixed attachment name; a failed read is a JSON error envelope. Download uses a new server cutoff, so identical filters do not promise an identical earlier snapshot.

The transport preserves `error.fieldErrors`, refusal `reason`/`nextAction`, HTTP status, error code and request ID. JSON/CSV content mismatches fail visibly.

## Integration gates still open

1. Quote policy snapshots and delivery activation are implemented in #67. Products without configured terms remain unconfigured. The takeover candidate adds real equipment/access readers and ADMIN future-policy configuration with exact-key retry. Replacement consumption/billing and ticket commands remain incomplete. Existing frozen quote terms must never change when future product policies are edited.
2. Authorized ticket list/detail/reload is on main through #66. Ticket POST authorization, caller-transaction replay, billing/stock obligations and SQL state/snapshot guards remain #53 work. Keep writes disabled until those pass; sending a header alone does not provide replay safety.
3. #69 provides real ADMIN-authorized financial sources, JSON/CSV reconciliation and pending-job/open-repair queues. Frozen approved labour rates/payroll, service billing/replacement, and subsidy evidence/actions remain incomplete. A completed installation stays financially provisional while costs are incomplete; no zero payroll is fabricated.
4. Tuhin/Codex now owns the all-screen consistency, accessibility, state/error/retry review and remaining implementation. No step waits on the former D1/D4 owners. Preserve session/role guards and avoid duplicate business rules in React.
5. The historical D4 seed still needs its real installation writer and persisted covered/chargeable repair scenes. Fixed preview IDs below are not proof of persisted outcomes. Real demo-phone/scanner evidence and three narrated whole-lifecycle rehearsals remain required.

## Final handoff obligations (retained from the original #44)

Each slice records its base/exact head, owned files, real endpoint request/response/error examples, shared contracts, actual seed/demo IDs, tests and desktop/mobile evidence, consuming module and exact remaining blocker. Final integration checks each screen's loading, empty, validation, 401/403, 409 reason/next-action, unavailable and uncertain-response retry states. One user intent retains one key/body until resolved. Covered/chargeable service scenes must separate customer charge from actual internal cost, show the real invoice once, preserve replacement lineage and require recorded customer confirmation.

## Verification scope

The new web suite checks server-rendered components plus mocked HTTP behavior: default mutation lock, saved coverage/lineage/action selection, exact display strings, query filters, malformed responses, 401/403/409/503, refusal next actions, CSV error handling and byte preservation. Synthetic IDs and facts live only in tests. Unit/preview fixtures are not persisted business acceptance. The separate database and production-browser suites provide persisted evidence for their explicitly exercised paths.

The test script is included in the existing root `npm test`/`npm run check` workflow without new dependencies. The development preview is separately typechecked by that script.

## Current integration evidence

#66 verified persisted sales/warehouse/field/ticket-read browser flows and device controls with simulated media. #69 verified real production financial JSON, downloaded CSV and raw database aggregates, plus 260 API DB, 2 web DB and 9 D4 tests. This evidence applies to implemented paths; it does not close the service-write, payroll, physical-device or whole-lifecycle rehearsal gates above.
