# Service ticket runtime acceptance

Base: `47c8ce3` (#74). Implementation: `8ec1c65d2a96fda5c46b68c79ca5a7494a8189f1`. The acceptance-document follow-up changes no runtime or migration behavior. Tuhin/Codex implements and verifies this takeover slice without waiting for D1/D4.

## Implemented behavior

Production NestJS routes now accept real active ADMIN/SUPPORT sessions and actor-scoped transactional Idempotency-Keys. They derive intake ownership from delivered allocation → job/order/customer → accepted quote/dispatch evidence, canonicalize UUIDs, and create one ticket/event for identical concurrent retries. Separate independent faults are allowed; no unsupported one-open-ticket rule is invented.

Coverage is assessed at the immutable complaint `createdAt`, converted to the engine's IST calendar date. Ordinary commands cannot backdate an occurrence. OPEN/ASSESSED tickets may correct scope before any work, invoice, billing or replacement effects. Append-only audit retains the actor and each prior/new decision. Equipment and warranty reads use the caller's transaction.

Resolution requires verified source and assessment plus finalized matching repair billing. A separately labelled no-work reason permits a withdrawn complaint only when no work lines, replacement or invoice effects exist. It does not count as repairing equipment. Closure requires actual staff-recorded customer name/channel/time after resolution; CLOSED facts cannot be rewritten. Exact retries return the original result without more transitions, costs or events.

Migration `20261031840000_service_ticket_integrity` adds nullable creator/source verification, explicit no-work reason and immutable before/after events. It enforces identity/source, actor, state/version, assessment, billing/cost/invoice reconciliation and closed-history rules. Existing rows receive no guessed creator, validation or audit. Eligible historical OPEN/ASSESSED rows must pass actual reassessment; inconsistent historical facts remain blocked. No previously merged SQL is edited. Twelve canonical rules bring the manifest to 220.

Review found that transaction-start timestamps could misorder decisions when an earlier transaction acquired its ticket lock later. Audit uses the actual event clock. A gated real-transaction regression starts the later decision first, commits its predecessor, then releases it; history still shows the saved decision order.

The React/Vite service workspace now enables these NestJS commands, stable saved links, reload and paged audit history. The shared command hook freezes edits and retains the exact key/body after an uncertain result. The UI shows saved intake time, coverage correction and the explicit no-work boundary. Private raw billing snapshots are omitted from history responses. The backend contains no React dependency or frontend business-rule substitute.

## Verification

| Check | Result |
|---|---|
| Full Node 22.23.3 check | 105 API unit, 18 web unit, 89 contract, 13 seed and 4 invariant tests; docs/schema/types and both production builds pass |
| Final fresh PostgreSQL 17.11 | 297/297 API DB, 2/2 web DB, 9/9 D4 migration tests; 28 migrations; 220 canonical rules; empty schema drift; 26 checker regression scenarios; healthy/unavailable-DB smoke pass |
| Focused real service cases | Seven actual session/HTTP/source cases cover roles, canonical IDs, wrong ownership/uninstalled refusal, concurrent exact intake and separate faults, complaint occurrence, wrong-scope correction/audit, competing versions, work/no-work boundaries, confirmation, append-only history, late caller rollback and audit lock ordering |
| Existing invoice/labour boundaries | Shared fixtures now create actual survey/quote/payment/stock/dispatch/delivery/private evidence/completion sources. Real repair billing, cost/invoice/ticket atomicity and finalized covered/chargeable closure pass. The approved repair source reader remains an explicitly synthetic boundary fixture, not a production part/time adapter |
| Populated upgrade | 27 → 28 migrations preserve exact hashes for 44 warranties, 423 units, 931 allocations, 83 files, 161 invoices, 477 costs, 151 jobs, 20 installation time records, six rate revisions, two labour approvals, 15 historical tickets and two ticket lines. Only the three newly added nullable ticket fields are excluded from the pre/post comparison; all remain null, with zero invented events |
| Preserved historical behavior | Actual legacy tickets remain readable with `sourceVerified:false`. Unverified resolution and inconsistent intake reassessment refuse without changes, command records or audit events |
| Final production browser | Three persisted installation runs, actual UI intake and lost committed response/exact retry, wrong-scope correction/history, explicit no-work confirmed closure/reload at 360 px, existing labour/pay/financial JSON/CSV reconciliation and warranty-policy replay; zero uncaught errors, exit 0 |

CI now runs the actual API/web/D4 database suites on isolated PostgreSQL 17.11 after migrations, in addition to the existing root checks, rule checker and smoke tests. CI completion is recorded on the PR's exact head; a local build alone is not labelled a green remote run.

The first browser pass reached actual intake/closure successfully but its subsequent warranty assertion matched both the lookup and a newly covered ticket-list row. The assertion is now scoped to the warranty panel; the final fresh browser run passes. The first upgrade probe assumed every table had an `id` primary key; it failed before migrating. Snapshot ordering now uses complete row JSON, and the final preservation run succeeds. Neither failed probe is counted as acceptance.

## Persisted demonstration evidence

These synthetic records were actually saved in the isolated final browser database; they are not production customer records or the unfinished historical seed.

| Scene | Identifier |
|---|---|
| UI-created, assessed and confirmed no-work ticket | `8ea2a1f1-016b-4eea-a579-6049edde9432` |
| Its completed installation job | `bfd73cdb-9b6d-4f18-a2a8-396b276aefc1` |
| Its real sales order | `7ccc9a48-3b3d-4341-99cd-31c05c06c916` |
| Third installation job | `b949373c-35bf-4c76-9ead-cd015d93384b` |
| Approved installation time | `251abf51-e146-4c8a-93d5-944e57ed7d02` |
| Warranty lookup unit | `004f4630-bdf6-412f-8d40-cb742d4c0c3e` |

Synthetic period revenue/cash `540000.00` and costs `16512.76` reconcile independently between raw persisted sources, report JSON and downloaded CSV. Costs comprise material `16500.00` and installation labour `12.76`; service/repair amounts remain zero because this browser scene explicitly performs no repair. They are not invented repair outcomes or a claim of final whole-job profit.

Reproduction commands and exact route/request/state/lock contracts are in the [service module](../../apps/api/src/service/README.md). Bind both `DATABASE_URL` and `TEST_DATABASE_URL` to an explicitly disposable `_test` database for migration/test commands. The browser's guarded `--migrate` mode validates that target before setup; the wrapper deliberately gives the ordinary database URL an unusable port. No normal local application database is migrated by this slice.

Local logs: `/tmp/sunshine-service-check.log`, `/tmp/sunshine-service-final-db.log`, `/tmp/sunshine-service-browser.log`, `/tmp/sunshine-service-upgrade.log`, `/tmp/sunshine-service-legacy.log`. Successful final processes exit 0. The source fixture and browser driver are committed; logs do not replace executable checks.

## Remaining original scope

Actual PART Product/quantity identity and creation, allocation FK/XOR/source guards, physical part issue/returns/replacement, continued coverage from actual replacement evidence, approved service time with separate internal/customer rates, ticket file authorization, subsidy evidence/actions, historical lifecycle seed, final per-screen UX/error/accessibility matrix, real-device evidence and three narrated complete demos remain open. Installation pay remains explicitly INSTALLATION_ONLY. Existing replacement helpers still require revision for immutable warranty facts and actual issue states. No whole #44/#53 parent or covered/chargeable repair demonstration is declared complete from a no-work ticket.
