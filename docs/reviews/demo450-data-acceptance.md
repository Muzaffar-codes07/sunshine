# 450-customer dataset acceptance

Verified 1 November 2026 on `codex/demo-450-customers`, based on main `b216ece`.
The implementation is local and uncommitted. No PR merge or source publication
is claimed. Setup and commands: [demo dataset guide](../../prisma/seed/DEMO450.md).

## Persisted dataset

The dedicated PostgreSQL 17 database `sunshine_demo450`, on local port 55440,
contains exactly 450 distinct synthetic customers and 450 enquiries. It also
contains 270 surveys, 200 quotes, 145 orders/jobs/sales invoices, 60 completed
installations, 15 OPEN service tickets, 644 warranties, 207 payments and 120
private evidence files. Total application rows: **18,974**, excluding 28 Prisma
migration bookkeeping rows. All 28 current migrations were applied normally.

The agreed customer distribution is 100 new, 80 qualified, 70 survey-stage,
55 quotation-stage, 45 awaiting fulfilment, 40 in fulfilment/field work and
60 completed installations. The 15 service customers are included in the last
60. There are 315 On-Grid and 135 Off-Grid customer enquiries. Six technicians
provide three crews. The manifest anchor is 2026-11-01 in Asia/Kolkata.

The final pipeline includes recent new enquiries, current-day invoices and a
current-day receipt, plus historical installations including covered and expired
components. Normal clocks and public API protections were not changed.

## Verification evidence

- `npm run check` passed: documentation, schema validation, type checks, all
  ordinary API/frontend/contracts/seed/invariant tests and production builds.
  On this Windows sandbox Vite/esbuild required elevated parent-directory read
  access. Locked dependencies were restored; package-lock content is unchanged.
- The dedicated PostgreSQL seed regression passed: late first completed-job
  failure rolled back the entire customer chain and cleaned its new blobs;
  resuming reached 450; rerunning did not duplicate rows; a progressed enquiry
  remained progressed; saved quote/order/job readers accepted the histories.
- The final date-refined dataset was imported through the guarded CLI. A second
  import preserved every per-table count: 450 customers and 18,974 rows.
- Production stock-integrity checks passed. Invoice lines, posted totals,
  receipts and balances reconcile. Material and approved labour costs match the
  independent manifest oracle. All private files passed byte/hash verification.
- Warranty lookup verifies `INV-ACTIVE-2025-01` as covered and
  `BAT-EXPIRED-2024-09` as expired, both at recorded complaint intake and at the
  verification date.
- `npm run demo:verify:http` passed 24 authenticated HTTP checks: first/last
  enquiry pages, five demo records, job/order reads, warranty lookup, ticket
  list/detail/history, profitability, CSV, month reports, operations, subsidies,
  pay, evidence downloads and the built SPA deep link. Current-month invoice
  and cash totals are nonzero at the seed anchor.
- A custom-format DB dump and matching evidence tree were restored into a new
  database `sunshine_demo450_final_restore_test`. The restored database passed
  reconciliation with 450 customers, 18,974 rows and 120 readable evidence files.

Detailed machine-readable evidence is local under ignored `var/demo450/`:
`verification.json`, `rerun-verification.json`, `http-verification.json`, and
`backup-final/restore-verification.json`. The final dump and matching evidence
tree are under `backup-final/`; named operator links are in `operator.md`.
Credentials are held only in the private local environment file, not these reports.

## Limits

All identities, money, history and evidence are synthetic and disclosed as such.
The sample roof image is a labeled illustration, and the signature says SAMPLE
ONLY. Imported serial entries use TYPED provenance; no camera or hardware scan
acceptance is claimed. The prepared warehouse case needs every required real
scanner input before its live dispatch. Physical service parts/replacement and
its billing adapters retain their existing production gates; the 15 service
tickets remain OPEN. Browser/device rehearsal is separate from the HTTP proof.

Use `npm run demo:450` to start this dataset's application configuration.
The normal `.env` and unrelated database containers were not changed. No API
process is left running by the HTTP verifier; the demo database container stays
available for the operator.
