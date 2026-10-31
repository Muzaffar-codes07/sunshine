# Delivery contract: ready, done, integrated and presented

## Source precedence

Owner instructions → authoritative Solar PDF → supplied deliverables constraints → current PRD/PDR/TRD and approved engineering decisions → implementation contracts/backlog. The research archive is provenance, not current implementation instruction. Unverified event fields remain unknown.

## Definition of ready

A ticket has one owner, required coding inputs, request/response/errors, valid fixture factories, acceptance checks, migration impact and a focused-hour estimate. Shared helper signatures exist early. Inputs can be valid test fixtures while upstream UI/API is being implemented; that does not permit invalid states or runtime mocks in final acceptance.

## Definition of code-ready versus integrated done

Code-ready means a module compiles and its isolated tests pass against valid fixture inputs. Integrated done additionally means the real upstream/downstream services and UI call it, side effects share a transaction, invalid states/access are rejected, risky invariants are tested, refresh preserves state, a second developer reviews it, and the full scene passes. A green scaffold build or planning checker is neither business done nor integrated done.

Backlog dependencies name coding prerequisites. B12, I11 and S13 join actual domain implementations; F08A/B/C are the corresponding frontend integration passes; F09 depends on all joins and actual evidence. Production acceptance cannot use fixture-only routes. Tests may use factories to construct valid PostgreSQL records before upstream controllers exist.

Incomplete providers must fail closed or remain unwired in the running app; never ship a production stub that returns “paid”, “approved” or “covered” just to unblock another module. Fixture providers belong only in isolated development/test setups, and the real-join gates prove their replacement.

## Shared ownership and change control

D1 owns frontend, D2 runtime/contracts convention/finance/release, D3 migration sequencing, D4 service/reporting/presentation. Domain owners author their schemas and tests. D2 owns submission checklist, D4 presentation; there is no shared unassigned submission owner. Short branches, reviewed small commits, no long isolated feature branches, all four contribute.

After schema/contract freeze, a change lists affected owners and migrations and supplies a compatibility path. After feature freeze no new scope; fix crashes, corruption, authorization failures and demo blockers only. Do not swap frameworks or hosting late because of a speculative preference.

## Verification evidence before claiming complete

| Layer | Required evidence |
|---|---|
| Requirement | Every R1–R25 row has actual endpoint/UI/test evidence and a status update |
| Stock/money | Real PostgreSQL concurrency/retry/reconciliation; no duplicated side effect |
| Field/service | Real uploaded sample evidence, confirmation gate, policy/date explanation |
| Device | Actual chosen scanner/phone/browser/topology result, not desktop emulation passed off as a phone test |
| Report | Actual queries match synthetic oracle, correct period/lifetime labels, CSV matches scope |
| Release | Fresh startup/migration/restore on prepared second host and DB/files match |
| Presentation | Three actual timed runs, record switches disclosed, all four speak |
| Submission | Actual organizer fields checked; required/recommended artifacts distinguished |

A future evidence log records commit, environment, command/scenario, result, owner, timestamp and unresolved limit. Do not pre-check planned tests, fabricate screenshots, invent latency or mark a requirement complete because a document describes it.

## Risk/limit handling

Simplify depth and presentation before cutting mandatory behavior. If a required feature remains absent, record it openly and ask the owner to decide scope or presentation consequences. No fake payments, static totals, invented scan provenance, clock changes or hidden demo-complete commands. A fallback record/recording is explicitly announced. No reset during an evaluator's session.
