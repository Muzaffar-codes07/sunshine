# Issue #44 frontend integration and acceptance

Candidate based on `main` at `1ff952f`. This is an implementation and evidence report, not a declaration that the entire D1 tracker is complete. Tuhin requested completion of #44; implementation proceeds in a separate integration branch.

## Preserved contributions and integration decisions

| Source | Integrated head | Result |
|---|---|---|
| #55 device controls | `37b67d1` | Shared scan/photo/signature controls and development-only capability page; corrected late-permission cleanup and overlapping detection. |
| #58 warehouse views | `c5beba5` | Stock history, movements, integrity, valuation and serial lookup retained alongside current main's fulfilment flows. Superseded receipt drawer removed; receiving uses the existing retry-safe command. |
| #59 field execution | `aa0496b` | Assigned jobs, job detail, uploads, customer signature and completion; current server time used when the start suggestion is unchanged. |
| #50 service/reports preparation | `8f393fe` | Routed as separate service and reporting workspaces; backend failures remain visible and ticket mutations stay disabled. |
| #56 authorized ticket reads | `778e920` | ADMIN/SUPPORT list and detail reads, shared response contracts and tests; new UI supports status filtering, pagination and persistent detail links. |

The branch merges original contributions, preserving their authors. The integration changes add role-aware navigation, direct-link refusals, route focus handling, responsive containment, rendering recovery and browser acceptance harnesses. Sales/order feature files remain unchanged.

## Correctness repairs

- Camera cancellation/unmount invalidates the current attempt. A stream acquired afterwards is stopped immediately; stale detection results are ignored. Only one asynchronous detection can run at a time. Disabling/manual submission also stops capture.
- One command intent has a stable key and exact body while its result is uncertain. A synchronous in-flight guard prevents repeated DOM events from starting two submits before React renders. Dispatch response-loss tests check real persisted effects and matching retry payloads.
- Manual entry defaults to TYPED and never satisfies scan readiness. Camera results become CAMERA; hardware keyboard emulation requires selecting USB/Bluetooth scanner explicitly. Tests simulate keyboard input and do not establish physical scanner compatibility.
- Warehouse integrations preserve reservation, dispatch and delivery; reads never calculate stock authority in React. Valuation has pagination. Movement quantities are displayed with source/destination locations, rather than labelling every movement as incoming.
- Vite refreshes optimized dependencies at startup because rebuilt workspace contracts keep the same package version. The prior cache retained an older job schema and stripped new fields, causing a reproducible field-page rendering failure. Production bundles compile current contracts directly.
- The unchanged start suggestion means the current instant, avoiding a start rounded down before a just-confirmed order. The backend remains responsible for timestamp validity.

## Routes and access

| Route | Staff UX access | Current behavior |
|---|---|---|
| `/workspace/sales` | ADMIN, SALES, TECHNICIAN | Existing sales pages or assigned surveys. |
| `/workspace/orders[/<id>]` | ADMIN, SALES, WAREHOUSE | Existing orders, invoices, payment and scheduling. |
| `/workspace/warehouse[/orders/<id>]` | ADMIN, WAREHOUSE | Real stock reads, receiving and fulfilment commands. |
| `/workspace/field-service[/jobs/<id>]` | ADMIN, TECHNICIAN | Real job reads, evidence and installation commands. |
| `/workspace/service[?ticket=<UUID>]` | ADMIN, SUPPORT | Persisted saved-ticket list/detail; warranty lookup can return 503; ticket mutations disabled. |
| `/workspace/reports` | ADMIN | Typed report/CSV views; production authorization/source adapters currently return 503. |
| `/spike`, `/patterns` | Development only | Device/pattern verification; removed from production routing/build. |

Navigation visibility is UX, not authorization. Backend session and role guards remain authoritative. Unauthorized direct links do not mount their feature queries. The rendering boundary provides a recovery route for unexpected display failures.

## Repeatable verification

Use Node 22.12+ and PostgreSQL 17. First build contracts/API and deploy migrations to an explicit disposable database. `npm run check` runs ordinary unit tests and production builds. Database tests remain separate:

```sh
npm run test:db -w @sunshine/api
npm run test:db -w @sunshine/web
npm run test:d4-migration
npm run db:check
npm run smoke
```

Optional browser harnesses use an independently installed `playwright` or `playwright-core` package, with no application dependency or additional test framework. Set `PLAYWRIGHT_PACKAGE` to its package directory if it is not resolvable locally. `CHROMIUM_PATH` selects an installed executable. A remote Playwright browser server can instead be supplied through `BROWSER_WS_FILE` for the lifecycle harness.

```sh
WEB_BASE_URL=http://127.0.0.1:5173 node apps/web/test/device-browser.mjs
TEST_DATABASE_URL=postgresql://.../sunshine_browser_test node apps/web/test/lifecycle-browser.mjs
```

The lifecycle harness requires port 5145, serves the built production application from its own API server (set `BROWSER_VITE=true` for an isolated development-server run) and synthetic staff/sales/stock records, and closes its servers. It never resets the database. Each run uses real approval, quote, order, payment and receipt services for setup; browser actions then reserve, scan, dispatch, deliver, upload and complete. It deliberately drops a committed dispatch response and retries the exact command. Saved tickets are explicitly synthetic persisted fixtures for read/refresh/authorization checks, not simulated repairs or warranty outcomes. All timestamps use the real clock.

Verification results and persisted run IDs are recorded in the PR. The harness is an automated warehouse-to-installation acceptance run, not a three-minute narrated end-to-end hackathon rehearsal.

## Remaining acceptance gates — keep #44 open

1. Actual demo phone/browser, secure context, camera permission and barcode/fallback, photo capture, signature and physical scanner results. Headless Chromium/media fixtures cannot establish these facts. Device/browser information has been requested from Tuhin.
2. #53 authoritative warranty policy/equipment readers, warranty access, replay-safe ticket commands, repair invoice/cost/replacement integration and historical installation seeds. Saved-ticket reads do not enable those writes.
3. #53 report authorization/source adapters, frozen approved labour rates, posted report/CSV reconciliation; pending-job/open-repair reporting and subsidy evidence/action integration remain incomplete. No fixture total is presented as production finance.
4. F08 full D4 persisted integration and F09 three timed whole-lifecycle rehearsals, including covered and chargeable service. Three automated warehouse/field runs do not meet this broader requirement.
5. Final production UX review by the accountable D1 owner and backend integration acceptance. This implementation report does not impersonate those reviewers or mark their sign-off complete.
