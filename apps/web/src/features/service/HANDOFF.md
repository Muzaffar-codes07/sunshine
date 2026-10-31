# Issue 44: D4 service and reports frontend handoff

Consumer and final UI reviewer: Nirmayi (`@3upho`). Feature implementation: Bhanu (`@vbtgongithub`). PR #50 now incorporates canonical `main` at `f438372`, including merged D4 PR #8. The feature files remain separate from Nirmayi's shared shell, routes, styles, device controls, warehouse and field pages. This handoff is reviewable without waiting for those pages.

## Components ready for review

- `ServiceWorkspacePage` — serial lookup, saved policy/coverage/lineage display and prepared ticket lifecycle forms.
- `ReportsWorkspacePage` — IST period overview, job profitability, technician pay, subsidy milestones and CSV download handling.
- Existing shared patterns and `Field` are consumed without editing them. Routes, navigation and global CSS remain with Nirmayi.

## Host integration

Use these exports within the authenticated workspace and its query provider after the production API gates below are met:

```tsx
import { ServiceWorkspacePage } from '../features/service';
import { ReportsWorkspacePage } from '../features/reports';
```

Mount the service page at a dedicated service child route that does not replace D3's field/job screen. Mount the reports page under the reports workspace. Leave `ticketCommandsEnabled` at its default `false` until the ticket APIs below are completed. The components do not assert that their guarded production reads are currently available.

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

An absent/expired session returns 401; a verified session without the required role returns 403. A stale ticket version returns 409 `STALE_VERSION` and must be reloaded before a new action. Some 409 responses also include `error.reasons[]` with `reason`, `source` and `nextAction`; the UI shows them when supplied. A currently unwired warranty lookup returns 503 `WARRANTY_AUTH_UNAVAILABLE` before any serial read. The UI shows unavailable rather than a fabricated result.

Report reads are `/reports/overview?period=today|week|month`, `/reports/pay-summary?period=...`, `/reports/profitability?jobId=<UUID>` and `/reports/subsidies`. For the synthetic covered job, the profitability URL would be `/api/v1/reports/profitability?jobId=d4510000-0000-4000-8000-000000000021`. This URL is an identifier handoff, not a claim that posted finance facts exist. CSV uses `/reports/export.csv?report=overview|pay&period=...` or `report=profitability&jobId=...`. A CSV success is `text/csv` with a fixed attachment name; a failed read is a JSON error envelope. Download uses a new server cutoff, so identical filters do not promise an identical earlier snapshot.

The transport preserves `error.fieldErrors`, refusal `reason`/`nextAction`, HTTP status, error code and request ID. JSON/CSV content mismatches fail visibly.

## Integration gates still open

1. PR #8's contracts and coordinated migration are on `main`. Deploying them does not wire production access. `WarrantyLookupAccess` and `WarrantyEquipmentReader` still default to 503; the latter must read real Unit and installation facts. Reporting still has 503 `ReportingAccess` and `ReportingSourceReader`/time-source defaults. D2/D3/D4 must supply verified adapters before production acceptance.
2. The ticket POST controller still ignores `Idempotency-Key`, and `ServiceTicketAccess` still defaults to 503. Backend replay in the caller transaction is required before enabling writes. Sending a header alone is not retry protection. Authorized detail/list reads are prepared in separate draft PR #56; they are not on `main` yet.
3. Repair billing/invoice/cost projections and replacement commands need public authorized routes. Pending-job/open-repair reporting and subsidy evidence navigation are also incomplete.
4. Nirmayi's route placement and UI review remain necessary for production release. These components can be implemented and tested before that input.
5. Real persisted API refresh/reconciliation, browser interaction, 360px layout and demo-phone checks remain pending. The historical D4 seed still lacks its real installation writer, so its stable preview IDs are not an acceptance dataset. Earlier browser tooling failed at initialization with `failed to write kernel assets`; no browser success is claimed.

## Verification scope

The new web suite checks server-rendered components plus mocked HTTP behavior: default mutation lock, saved coverage/lineage/action selection, exact display strings, query filters, malformed responses, 401/403/409/503, refusal next actions, CSV error handling and byte preservation. Synthetic IDs and facts live only in tests. These are not persisted business acceptance tests.

The test script is included in the existing root `npm test`/`npm run check` workflow without new dependencies. The development preview is separately typechecked by that script.
