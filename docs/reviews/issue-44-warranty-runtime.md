# Issue #44 warranty runtime acceptance

Base: `89641ff` (#70). Implementation: `b844383` (plus the earlier scope-audit commit `f5d0883`). The final evidence commit changes documentation only. Existing #67 quote/delivery policy foundations and #70 file/invoice work are retained. Tuhin/Codex implements and verifies the remaining work; former D1/D4 owners are not availability or approval dependencies.

## Implemented behavior

- ADMIN/SUPPORT serial lookup verifies the active persisted staff session, scoped UUIDs and serial ambiguity before disclosing bounded customer/job facts. Anonymous/forged-role requests receive 401; other roles receive 403; revoked sessions lose access.
- Equipment ownership follows delivered/installed allocations through the actual order, accepted quote and customer, never ticket claims. Reservations and dispatch without delivery do not become customer installation evidence.
- Coverage validates the saved policy and calendar interval against the original frozen quote and recorded delivery. Current catalogue edits never alter sold terms. Damaged promised coverage fails closed. Lookup alone cannot price unrelated repair labour.
- ADMIN configures future warranty terms with strict bounded input, a saved fingerprint, a new revision for changed terms, a product lock and actor-scoped transactional idempotency. Concurrent initial creation has one winner; duplicate requests replay and late retries do not overwrite a newer policy. No real supplier terms are invented.
- The configuration editor retains the exact request key/body after an uncertain response and disables edits/product changes until resolved. SUPPORT can look up coverage but cannot see or use configuration controls.
- Migration `20261031820000_warranty_facts` validates supported calendar-month intervals and preserves identity/terms/dates, deletion history and one-way versioned voiding. Applied migration SQL remains unchanged. Four new canonical rules bring the manifest to 198.
- Dispatch detail distinguishes active, expired, void, not-started and unconfigured coverage. A predecessor pointer makes the original serial ineligible for another free lookup; it does not prove the new serial was consumed, costed or delivered. Replacement coverage still fails closed until that writer is verified.
- A reproduced warehouse race is fixed: reserve/prepare actions wait for independent order/job/allocation/dispatch readbacks. The browser test deliberately holds the updated job readback and verifies Prepare remains disabled until its version arrives.

## Verification and reproduction

Use Node 22.23.3 and PostgreSQL 17.11 with an explicitly disposable database whose name ends in `_test`. Bind both `DATABASE_URL` and `TEST_DATABASE_URL` for ordinary test commands. The browser driver's `--migrate` option validates `TEST_DATABASE_URL`, sets `DATABASE_URL` from it, and only then invokes migration setup; do not run a separate unbound migration command.

```bash
npm run check
npm run db:deploy
npm run test:db -w @sunshine/api
npm run test:db -w @sunshine/web
npm run test:d4-migration
npm run db:check
npm run test:constraints
./node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run smoke
# Requires a separately installed Playwright/Chromium and built production app:
node apps/web/test/lifecycle-browser.mjs --migrate
```

Evidence:

| Check | Result |
|---|---|
| Fresh full check | 104 API unit, 18 web unit, 89 contract, 13 seed and 4 invariant tests; builds/types/docs pass |
| Fresh PostgreSQL integration | 285 API DB + 2 web DB + 9 D4 migration tests pass; 26 migrations; 198 rules; 26 checker regression scenarios; healthy/unavailable DB smoke pass |
| Final affected frontend verification | After the warehouse readback fix: web tests/build, production browser, 198-rule checker, empty schema drift and both smoke modes pass |
| Final warranty suite | 13 persisted PostgreSQL/HTTP scenarios pass, including the additional direct-SQL invalid-date/leap-month case; this test-only addition follows the broad 285-case run |
| Populated upgrade | 22 → 26 migrations, exact pre/post hashes unchanged for 17 warranties, 379 units, 831 allocations, 73 files, 139 invoice source records and 372 cost entries; the newly added nullable invoice field is excluded from comparison |
| Final production browser | Three persisted installation runs, ADMIN/SUPPORT coverage, hidden SUPPORT policy controls, lost policy-save response/exact retry, frozen sold policy after future edits, delayed job readback, reload and 360px field/warehouse containment; zero uncaught browser errors. The subsequent labour acceptance explicitly restores a 360px viewport before the report/policy screens. |

Local logs: `/tmp/sunshine-warranty-acceptance.log`, `/tmp/sunshine-warranty-final-db.log`, `/tmp/sunshine-warranty-final-ui.log`, `/tmp/sunshine-warranty-upgrade.log`, `/tmp/sunshine-warranty-browser.log`. Each successful process exited 0. A previous guarded browser run found the stale-version race; `/tmp/sunshine-warranty-browser-readback-race.log` records that failed run and is not counted as acceptance.

## Actual persisted browser identifiers

These are synthetic records actually written to the isolated browser database, stable within this recorded run. They are not the unfinished historical D4 seed and are not promised to survive a database reset.

| Scene | Order | Job |
|---|---|---|
| Public enquiry → sales/survey/quote/payment → ADMIN installation | `ad117cec-a903-4925-93cf-0dccbcc3aa84` | `005418e7-6618-481d-9e6f-db7c782aa92b` |
| Assigned TECHNICIAN installation | `8ceeeb70-9c50-4aed-9051-3c2faa340d4d` | `7178d40a-0028-433d-bd4b-3c858ddd1f52` |
| WAREHOUSE fulfilment → installation | `143f6af9-e5c0-4544-a02a-4a369284cb21` | `9d6b662f-36cd-4531-885e-98c834a9a67d` |

The final warranty lookup uses actual unit `21a91313-7401-41db-8316-6bb378595710`; the response-loss policy key is `a45e0fe9-d1fa-445e-82d8-6af23ca64aa9`. Production report JSON/downloaded CSV/raw SQL agree on synthetic period revenue/cash `1260000.00` and posted costs `32839.00`; these are test-database totals, not company results. Labour/service costing remains provisional.

## API and consuming screens

`GET /api/v1/warranties/lookup?serial=<actual serial>&manufacturerId=<optional UUID>&productId=<optional UUID>` returns the bounded unit/customer/job projection and complete saved coverage result. It uses server time, refuses unknown/ambiguous serials, and cannot be backdated through query fields. `/workspace/service` consumes it; warehouse delivery detail consumes the expanded coverage-status contract.

`GET /api/v1/warranty-policies/:productId` returns `{data:{productId,policy,fingerprint}}`; unconfigured terms are null. `POST` accepts the exact returned fingerprint plus `{policyName,revision,scope,durationMonths}` with an Idempotency-Key. Its response has the same shape. Real tests exercise 400 strict-input errors, 401/403, 404 product, 409 `STALE_POLICY`, `POLICY_REVISION_REQUIRED`, `POLICY_PRODUCT_INVALID` and `IDEMPOTENCY_CONFLICT`; the UI presents refusal reasons/next actions. Product locks, updates and replay results share one transaction.

## Verification setup incident

An early browser wrapper ran `db:deploy` without binding `DATABASE_URL`, so the repository's local development connection was used. Its migration history had only the platform migration; it was advanced to the candidate schema. Read-only audit found zero users, customers, orders, files, units and warranties. No shared data was deleted or rolled back. The wrapper was corrected, and migration setup now sits inside the browser driver's explicit disposable-database guard. The final browser verification deliberately supplied an unusable default `DATABASE_URL` and successfully used only `TEST_DATABASE_URL`. This incident is not represented as a clean shared-database upgrade or hidden from the acceptance record.

## Still required

Ticket SQL/source/state/snapshot guards, replay-safe ticket commands, auditable occurrence/reassessment, actual part consumption/replacement lineage and billing before closure, approved frozen labour/payroll, subsidy evidence/actions, historical persisted seed, the complete per-screen state/accessibility matrix, physical phone/scanner proof and three timed narrated full-lifecycle rehearsals. None is marked complete by this lookup/configuration slice. Original #44 scope and all thirteen #53 activation gates are preserved.
