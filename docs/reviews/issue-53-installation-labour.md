# S04 installation labour and pay acceptance

Base: `3787c92` (#72). Implementation: `3e78bde`. The final acceptance-document commit changes no application or migration behavior. Tuhin/Codex owns implementation and verification under the D1/D4 takeover; no other-owner availability or signoff is assumed.

## Delivered

Completed jobs already saved immutable technician time but had no approved rate, posted labour cost or persisted payroll source. ADMIN can now save an approved rate revision and approve an actual time record. That transaction freezes elapsed time/rate/reference/approver/note and posts one `TIME_RECORD:<id>` / `INSTALLATION_LABOUR` entry through the existing single cost writer. Exact/concurrent retries replay; changed inputs refuse; failures roll back approval, cost and command together.

Rates are append-only and are never seeded from guessed wages. Later revisions do not reprice prior work. Pending/approved time can be paged and reloaded, with the real job/technician and cost-source links. API/session guards restrict these sensitive reads and writes to active ADMIN users. The reports workspace uses the shared exact-request retry flow and refreshes finance/pay after approval.

Pay uses exact recorded milliseconds × the frozen hourly rate, rounded half-up to cents once per entry. Display hours are rounded independently to three places. This avoids losing real pay on a positive sub-millihour interval. Pay JSON and CSV explicitly say `INSTALLATION_ONLY`; service time and unapproved work are excluded, not assigned zero wages. Approved pay is an accrual, not a claim of cash disbursement.

Migration `20261031830000_installation_labour` adds `TechnicianRateRevision` and `InstallationLabourApproval`, restrictive source FKs, exact arithmetic/source checks and immutable update/delete/truncate guards. It verifies the completed installation, within-job interval, assigned technician, selected technician rate, active ADMIN and exact cost source/occurrence/amount. Existing time rows receive no invented rates or approvals. Ten canonical rules bring the manifest to 208.

Job profitability becomes final only when actual installation time is approved and posted. Legacy completions without time, unapproved intervals, reversed labour costs awaiting reconciliation, and incomplete service work remain provisional. No stock/warranty/cost-writer implementation was rewritten by this slice.

## Verified candidate

| Check | Evidence |
|---|---|
| Full Node 22.23.3 check | 105 API unit, 18 web unit, 89 contract, 13 seed and 4 invariant tests, builds/types pass |
| Final fresh PostgreSQL 17.11 run | 290/290 API DB, 2/2 web DB, 9/9 D4 migration tests; 27 migrations; 208 canonical rules; empty schema drift; 26 checker regressions; healthy/unavailable DB smoke pass, exit 0 |
| Real labour integration | Actual survey/quote/payment/receipts/allocation/scans/dispatch/delivery/crew/start/private evidence/completion precede approval. ADMIN/other-role denial, scoped uppercase IDs, frozen rates, duplicate and changed-key races, rollback, cutoffs, pay/CSV/profit equality and reversed-cost provisionality pass |
| SQL backstops | Rate/approval update/delete/truncate refused. Wrong cost source refused by the exact named guard. An explicitly corrupted historical-time fixture bypasses only its original insert trigger inside the isolated DB, restores it in `finally`, and proves labour approval refuses unassigned/out-of-job time with no cost/command left behind |
| Populated upgrade | 26 → 27 migrations preserve exact hashes for 139 jobs, 16 time records, 17 warranties, 379 units, 831 allocations, 73 files, 139 invoice source records and 372 costs. New rate/approval tables remain empty; no historical wage backfill |
| Final production browser | Three persisted installation runs, labour-rate configuration and lost committed approval response/exact retry, one cost per time source, pay/raw SQL and financial JSON/downloaded CSV equality, reload, existing warranty/configuration retry and delayed-readback race. Actual viewport reset to 360 px before reports; labour and warranty/policy containment pass; zero uncaught errors, exit 0 |

The first broad integration run found two verification-fixture issues, not two accepted failures: the existing job guard rejected an attempted corrupt-history insert, and the new approval FK made a plain TRUNCATE fail before the old append-only trigger. The corrected corrupt-history fixture is explicit; the existing truncate test now uses CASCADE so the evidence trigger itself must still reject it. The final fresh run passes all 290 cases. Initial mapping/contract assertions were corrected before the successful full check. Failed logs are not counted as acceptance.

The previous browser driver switched to desktop for stock review and did not explicitly restore the reports viewport. This follow-up resets it to 360 px and verifies the new report/approval and warranty/configuration screens at that actual width; earlier field/warehouse mobile evidence is not treated as blanket all-screen accessibility acceptance.

Local logs: `/tmp/sunshine-labour-acceptance.log` (full check passes; earlier API fixture failures remain recorded), `/tmp/sunshine-labour-final-db.log` (final fresh suite, exit 0), `/tmp/sunshine-labour-browser.log` (final actual-360px browser, exit 0), `/tmp/sunshine-labour-upgrade.log` (populated preservation, exit 0). Reproduction uses the commands in [labour module](../../apps/api/src/labour/README.md) and [warranty acceptance](issue-44-warranty-runtime.md#verification-and-reproduction), with both database variables explicitly bound to disposable `_test` databases. Browser setup uses its guarded `--migrate` mode; no local application database was migrated by this slice.

## Actual persisted demonstration identifiers

Synthetic records really saved in the isolated browser database, stable within this recorded run:

| Item | ID |
|---|---|
| Final completed order | `65ef5135-b752-4f06-b964-b039534ec382` |
| Job | `f7db79c2-7ec4-4deb-87be-fc727891dd5b` |
| Approved installation time | `4a000ae5-0580-4350-bdb5-2a4b02000320` |
| Exact approval retry key | `0a22eaf7-0afd-40cb-a3dd-b82d9b23545f` |
| Warranty unit | `19dc34fb-0691-4939-a543-f02dde19ff0f` |

Period totals at the captured server cutoff reconcile: synthetic revenue/cash `1080000.00`, costs `32948.81` = material `32814.02` + installation labour `134.79`. The database contains multiple explicitly synthetic runs; these are not company financial results or finished historical seed IDs. Three short automated runs are not three narrated whole-lifecycle rehearsals.

## Interfaces and remaining scope

`GET/POST /technician-rates`, `GET /time-entries`, `GET /time-entries/:id`, `POST /time-entries/:id/approve` and existing `/reports/pay-summary` / pay CSV use shared runtime contracts. Strict POST bodies reject client-owned amount/approval/source overrides. Mutations require an Idempotency-Key; canonical UUIDs and rate decimals participate in actor-scoped replay. Request bodies, statuses, pagination and lock/source rules are specified in the module README; `/workspace/reports` consumes them. Errors retain field messages, refusal reasons/next actions and request IDs.

This closes D3's installation labour-cost portion of S04. Service-time capture/pay, ticket SQL/state/idempotency/billing, actual PART issue/replacement/returns, subsidy evidence/actions, historical full-lifecycle seed, the final per-screen error/accessibility matrix, actual phone/scanner proof and three narrated complete demos remain open. Approved labour evidence cannot be silently edited for corrections; reversed costs remain a visible reconciliation obligation. No parent requiring service payroll is marked complete here, and no original #44/#53 obligation is removed.
