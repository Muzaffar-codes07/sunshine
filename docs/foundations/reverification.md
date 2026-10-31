# Foundation and build-plan re-verification

Date: 31 October 2026. Baseline scaffold: `7a59172`. Scope of this revision: PRD/PDR/TRD, technology reasoning, foundation decisions/delivery contract, build/demo plan, traceability/oracles and documentation verification tooling. No business endpoint, UI workflow or domain migration is implemented by this revision.

## Source reconciliation

- Re-read the repository Solar PDF and supplied organizer-video document.
- All R1–R25 mapped to an accountable backend owner, D1 frontend owner, existing backlog IDs, observable acceptance and short/full evaluator proof. Additional PDF wording on customer clarity and receiving documents is addressed in PRD/PDR, not silently omitted.
- Current specific event URL remained inaccessible; the general Odoo page supports hiring/teamwork/24-hour context only. No new mandatory submission, hosting, framework or deadline claims.
- Latest owner decisions retained: Solar; one dedicated frontend plus three backend owners; ignore unverified wall dates; publish foundation docs to the existing repository. No visibility change or history rewrite.

## Peer review and corrections

Claude supplied an independent demo proposal and critiques through Bridge thread 6. Incorporated corrections: short staged pitch versus full new-customer walkthrough, one operator, covered replacement turning a fully paid job negative, pending supplier claim excluded, correct period/lifetime scopes, device secure-context/connection gate, actual scan provenance, no live reset, additional ERD relations, version-familiarity qualification, source/owner distinctions and PRD/TRD unhappy paths/security details.

Both agents identified that the first H8 full-sales gate exceeded D2's own estimates. The original dependency chain also prevented a 24-hour finish. The revision defines fixture-enabled coding inputs and real integration joins, splits D1's final integration into domain slots, and verifies a concrete resource schedule. No mandatory runtime gate is bypassed to make the schedule fit.

Claude independently rechecked the resource schedule, dependencies, breaks, gates, financial arithmetic and period anchors in Bridge thread #6 (message 332). His conditional sign-off required four final documentation fixes: enquiry polling latency, presentation traceability, serial lookup in the short pitch, and the persisted-UI milestone. Those fixes are included. The recommended scheduling sensitivity warning is also explicit; final integration acceptance remains late and incremental endpoint pairing is required at earlier gates. Timed live demonstration and actual phone behavior remain future evidence.

## Checks performed on this candidate

| Check | Result and practical limit |
|---|---|
| `npm run check:docs` | Current document links and 22 source-copy paths pass |
| `npm run check:plan` | 49 tickets, four owners/one dedicated frontend, R1–R25, dependency DAG, effort, one task/owner, breaks and gate timing pass |
| Resource candidate | D1 16h, D2 16.25h, D3 16h, D4 16.25h focused; scheduled finish H21.75, release H22.5, recovery 1.5h. Estimates are not measured throughput |
| Worked financial checks | D/E job arithmetic, portfolio, selected CSV totals, technician pay and three IST day/week/month anchors reconcile |
| `npm run check` | Schema validation, TypeScript, existing shared-contract tests and production frontend/backend builds pass; no new business correctness claim |
| `git diff --check` | Authored changes have no whitespace errors |

GitHub CI for the published candidate is checked after push and reported in the handoff. A previous scaffold CI run does not certify this revision automatically.

## Still unverified and deliberately not claimed

Business implementation, current-organizer rules behind the event surface, real customer/competitor validation, actual domain concurrency/coverage/financial queries, long-term-volume benchmarks, real phone/scanner/mirroring, second-host restore, and three <=180-second live rehearsals. The planning checker validates document assumptions and sample arithmetic; it does not execute those application behaviors.
