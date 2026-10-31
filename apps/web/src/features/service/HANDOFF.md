# Issue 44: independent D4 frontend preparation

This branch is stacked on PR #8, because its D4 contracts are not yet on main. The integration merge also incorporates canonical main `bd7b97e` (Files). It does not activate the D4 draft migration or change backend behavior.

## Components ready for review

- `ServiceWorkspacePage` — serial lookup, saved policy/coverage/lineage display and prepared ticket lifecycle forms.
- `ReportsWorkspacePage` — IST period overview, job profitability, technician pay, subsidy milestones and CSV download handling.
- Existing shared patterns and `Field` are consumed without editing them. Routes, navigation and global CSS remain with Nirmayi.

## Host integration

Use these exports within the authenticated workspace and its query provider:

```tsx
import { ServiceWorkspacePage } from '../features/service';
import { ReportsWorkspacePage } from '../features/reports';
```

Mount the service page at a dedicated service child route that does not replace D3's field/job screen. Mount the reports page under the reports workspace. Leave `ticketCommandsEnabled` at its default `false` until the ticket APIs below are completed. This is a backend gate, not a request for design input.

For review without changing shared routes, start the web server (for example `npm run dev -w @sunshine/web -- --port 5187`) and open `/test/d4-preview.html`. The preview uses the real API proxy with no success fixtures and leaves writes disabled. Production builds do not include that HTML entry.

## API examples

Read `GET /api/v1/warranties/lookup?serial=INV-TEST`. Optional manufacturer/product UUIDs disambiguate a serial. A validated response contains `data.unit`, nullable customer/job projections and a complete assessment with reason, dates, policy revision and customer charge. A 503 is displayed as unavailable; no coverage is inferred from it.

The prepared ticket action bodies match the backend:

```json
{"unitId":"11111111-1111-4111-8111-111111111111","faultDescription":"Inverter fault"}
```

```json
{"version":1,"asOfDate":"2026-11-01T00:00:00.000Z","requestedScope":"inverter"}
```

`resolve` uses `{version, resolutionDetails}`; `confirm` uses `{version, confirmerName, channel, confirmedAt, notes?}`. Timestamps are transmitted with an explicit offset. Device-local datetime fields are labeled as such. No unit/customer/job linkage, charge or eligibility is authored by the browser.

Report reads are `/reports/overview?period=today|week|month`, `/reports/pay-summary?period=...`, `/reports/profitability?jobId=<UUID>` and `/reports/subsidies`. CSV uses `/reports/export.csv?report=overview|pay&period=...` or `report=profitability&jobId=...`. CSV uses a new server cutoff at download time, so identical filters do not promise an identical earlier snapshot.

The transport preserves `error.fieldErrors`, refusal `reason`/`nextAction`, HTTP status, error code and request ID. JSON/CSV content mismatches fail visibly.

## Integration gates still open

1. PR #8's contracts, coordinated migration and verified production access/read adapters must land before production feature acceptance.
2. The ticket controller currently ignores `Idempotency-Key`. Backend replay in the caller transaction and ticket list/detail GET routes are required before enabling writes. Sending a header alone is not retry protection.
3. Repair billing/invoice/cost projections and replacement commands need public authorized routes. Pending-job/open-repair reporting and subsidy evidence navigation are also incomplete.
4. Nirmayi's route placement and UI review remain necessary for production release. These components can be implemented and tested before that input.
5. Real persisted API refresh/reconciliation, browser interaction, 360px layout and demo-phone checks remain pending. Browser tooling in this session failed at initialization with `failed to write kernel assets`; no browser success is claimed.

## Verification scope

The new web suite checks server-rendered components plus mocked HTTP behavior: default mutation lock, saved coverage/lineage/action selection, exact display strings, query filters, malformed responses, 401/403/409/503, refusal next actions, CSV error handling and byte preservation. Synthetic IDs and facts live only in tests. These are not persisted business acceptance tests.

The test script is included in the existing root `npm test`/`npm run check` workflow without new dependencies. The development preview is separately typechecked by that script.
