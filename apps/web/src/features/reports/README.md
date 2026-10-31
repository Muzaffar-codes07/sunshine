# Reports workspace

Issue #44 assigns this bounded D4-facing frontend slice to Bhanu for Nirmayi's UI review.

`ReportsWorkspacePage` reads typed overview, profitability, technician-pay and subsidy endpoints and downloads server-generated CSV. Each JSON result is validated against `@sunshine/contracts`; decimal strings are formatted without recalculating money. CSV errors remain visible in the page, wrong content types are rejected, and download object URLs are revoked. The export uses the current selected filters and the server's current cutoff; it is not a frozen copy of an earlier rendered report.

The UI displays IST period boundaries, the exclusive end date, server cutoff and provisional job results. Errors and empty datasets have distinct states. Pending-job/open-repair queues, subsidy evidence navigation, production auth/read adapters and report reconciliation against PostgreSQL remain integration work.

Preview via `/test/d4-preview.html` on the web development server; no `App.tsx`, navigation, shared component or global stylesheet edits are required. Tests use synthetic server responses only and make no live business acceptance claim.

Nirmayi owns final routing, shared-shell changes, visual review, accessibility and mobile integration.
