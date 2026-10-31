# Resource-aware 24-hour execution overview

Start with [the full build plan](demo-build-plan.md), [PRD](../PRD.md), [PDR](../PDR.md), [TRD](../TRD.md), [backlog](build-backlog.json), [traceability](requirements-traceability.csv) and [operator runbook](demo-runbook.md). This replaces earlier optimistic H8 full-sales/H16 full-demo gates.

The backlog has a concrete one-task-per-owner candidate with coding dependencies, real domain/UI integration joins, and three staggered half-hour breaks per person. It finishes at **H21.75 under the estimates**, targets release H22.5 and leaves **H22.5–24** for recovery/submission. It is not measured throughput or a guarantee. Focused estimates are D1 16h, D2 16.25h, D3 16h, D4 16.25h; remaining time includes breaks, waiting/review and contingency. Do not promise 24 equally productive hours.

## Four lanes and verifiable gates

| Hours | D1 frontend | D2 platform/sales/finance | D3 inventory/database | D4 field/service/reporting | Gate |
|---|---|---|---|---|---|
| 0–1.5 | Shell/patterns | Contracts/runtime/auth start | Schema/catalogue | Job contracts, then core helper | G1 contracts/schema |
| 1.5–6 | Enquiry/survey form and device spike | Auth/enquiry/survey/private files | Actual receipts/units/fixture-backed allocation | Assigned jobs, coverage/ticket core, evidence | G2 persisted intake + hardware capability |
| 6–12 | Quote/payment/warehouse/field patterns | Finance writer, frozen quote, confirmation preparation | Replacement/dispatch/activation primitives and tests | Time/cost/repair helpers, fixtures | G3 quote/finance/core allocation |
| 12–15 | Service/report surfaces | Join actual order/job/invoice/payment, subsidy | Real delivery/activation; invariant tests | Complete field/service/report queries | G4 order by H13; G5 endpoints by H15 |
| 15–19 | Finish report patterns; sequential integration slots | Sales/finance integration and security tests | Fulfillment integration, restore, ERD | Service/report tests, demo fixtures | G6 feature freeze H19 |
| 19–20.75 | Domain integration passes | Support own endpoint fixes | Support fulfillment fixes | Service/report final join | G7 complete evaluator path |
| 20.75–22 | Three timed runs and critical UI fixes | Release/submission check | DB/files/scan proof | Presenters/evidence | G8 rehearsal |
| 22–22.5 | Release verification | Freeze artifacts | Verify migration/seed | Confirm script/limits | G9 release |
| 22.5–24 | Recovery | Recovery/submission | Recovery | Recovery/presentation | Buffer |

The detailed `resourceSchedule` is more precise than these broad bands; they are not independent staffing estimates. Breaks: D1 H4/9/14 for 30min each; D2 H4.5/9.5/14.5; D3 H5/10/15; D4 H5.5/10.5/15.5. Idle integration windows can be used for rest/review, not an unassigned extra feature list. `npm run check:plan` checks effort, owner overlap, dependency order, breaks, gate-task finish times and recovery allocation.

## Parallelism without fake done

Stock and service core code can use valid PostgreSQL fixture factories after the schema/contracts are frozen; it need not wait for an entire sales UI. Runtime payment/stock/coverage rules still apply. B12/I11/S13 join real services, F08A/B/C join UI; F09 cannot pass without all joins. An isolated helper is code-ready, not integrated done.

At checkpoints D1 gets short consecutive sales, fulfillment and service slots; the relevant backend owner stays to fix payloads. Everyone writes their own domain tests and commits. D2 owns submission/release, D4 owns the presentation.

## P0, cuts and missed-gate response

R1–R25 remain P0 at simple depth, including actual scanning, pay summary, subsidy milestones, expired billing and CSV. Seed templates instead of building editors; record payments manually; one warehouse; no external integration or full payroll. P1/P2 may not steal time before core acceptance.

At H6 foundation failing, fix it before more pages. At H12 shared-helper failure, stop optional work. At H15 missing fulfillment, all affected owners join the handoff. At H19 no feature/schema expansion. At H20.75 missing mandatory flow, record the failure and fix it before presentation polish. At H22.5 freeze the known release; do not switch frameworks/hosting or fake outputs. A shorter honest presentation is allowed; dropping a mandatory implementation silently is not.

## Ten risks

| Risk | Probability / impact | Warning | Prevention / recovery | Owner |
|---|---|---|---|---|
| Sole frontend bottleneck | High/high | Disconnected screens | Six patterns, fixed slots; D2 emergency rescue | D1 |
| D2 overload | High/high | Auth consumes first 3h | Narrow finance APIs; D3 release help | D2 |
| Double allocation | Medium/critical | Unlocked read-check-write | PG concurrency test; stop fulfillment until fixed | D3 |
| Schema drift | High/high | Late shared-field changes | Reviewed migration queue; compatibility changes only | D3 |
| Financial double count | Medium/high | Purchases and consumption both costed | Unique sources/reconciliation; remove wrong cards | D2 |
| Phone scan/files fail | Medium/high | No real-device trial | Early test; USB/file-picker fallback | D1 |
| Isolated modules | High/high | Only fixture demos | Integration gates; pause optional work | D2 |
| Release failure | Medium/high | Cloud-only runnable build | Local release and second-machine backup | D2 |
| Warranty/replacement error | Medium/high | Serial overwritten or expiry reset | Lineage/policy/date tests; reviewed policy | D4 |
| Submission/team omission | Medium/high | Portal unchecked or one member speaks | D2 verifies submission artifacts; D4 coordinates all-member presentation | D2 |

## Planning self-critique

Judgment scores, not forecasts: feasibility 7/10, workload balance 7, architecture 8, integration 8, PDF coverage 9, UI 7, demo 8, differentiation 8, deployment 8, competitive strength 8. The greatest risks remain the sole frontend owner, D2's breadth and modest buffer. Mitigations are six reusable patterns, narrow shared helpers, fixture-enabled parallel development, real joins, no optional integrations, and a staged short pitch plus full evaluator path. Update estimates when implementation evidence arrives.
