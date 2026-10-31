# Demo operator runbook and evaluator walkthrough

**Planned, not implemented or rehearsed yet.** This is the target for the build, not a claim that the scaffold can perform it. A three-minute presentation and a complete evaluator walkthrough are different artifacts. Both use the same real APIs and PostgreSQL; there is no fake demonstration backend.

## 1. Story and record preparation

Opening: “Solar software already manages projects. We focused on the handoffs where the company loses traceability: what was approved, which unit went out, who pays for service, and what the job actually earned.”

Use labeled synthetic records with a rehearsal/run suffix. Do not imply the prepared cases are a single newly created customer:

| Case | Prepared state | Live proof | Chronology |
|---|---|---|---|
| A: sale | Qualified enquiry; submitted survey; no accepted quote/order | Approve, generate complete 3 kW BOM/quote and record acceptance/advance | Current sample lead; no field completion claimed here |
| B: warehouse | A separate paid order, reserved equipment; other required units already scanned with visible records | Scan representative inverter, dispatch, record delivery, inspect warranty; battery and controller scans are required too | Order/payment predate dispatch; all mandatory serialized scan records required before leaving |
| C: field | Separate delivered job in progress, start time before presentation | Upload a real sample photo, capture signature, complete | Use actual prepared sample start/end; never enter future labour or complete before delivery |
| D: service | Separate fully paid installation delivered 18 months before seed date; open covered replacement ticket and spare reserved/scanned, but replacement not posted | Inspect coverage, finalize replacement/cost/lineage, record customer confirmation | Historical dates are seeded explicitly; current clock stays unchanged |
| E: expired (Q&A) | Separate fully paid non-subsidized sample with expired component coverage and explicitly no active service cover; prepared billed repair | View prepared billed result in short pitch; fresh unbilled variant for full evaluator proof | No claim about actual government-service eligibility |

Prepared records contain real related database rows and sample evidence where specified. A seeded stage is announced; a live action is not silently pre-done. The new-enquiry full path is available separately. If only one connected customer is requested, use the longer evaluator walkthrough rather than claiming these cases are one.

## 2. Three-minute presentation: budget and speakers

The operator remains on one laptop; D3 may hold the barcode and D4 the phone. All four speak briefly. Use pre-authenticated real accounts, not a role picker. A legitimate admin can drive the short presentation; record-scoped technician/support permissions are verified separately. No keyboard handoff or sign-in ceremony inside the pitch.

| Time | Speaker / screen | Action and proof |
|---|---|---|
| 0:00–0:10 | D1, workspace | Opening; identify prepared stages and visible customer/job IDs |
| 0:10–0:35 | D2, A sales | Show recorded enquiry/qualification/survey, approval gate, approve and generate quote/BOM. Show packing/schedule/payment only if rehearsed; no false claim that they were demonstrated live |
| 0:35–1:05 | D3, B warehouse | Announce prepared 1 kW Off-Grid paid order. Scan representative inverter; every panel/controller/battery already has visible valid scan evidence. Dispatch, deliver and inspect customer linkage/warranty |
| 1:05–1:30 | D1/D4, C field | Announce crew already on site. Show valid start/kW, upload sample photo, sign and complete; the audience sees the phone/mirrored result |
| 1:30–2:10 | D4, D service | Announce historical fully paid job and prepared open ticket/spare reservation. Search the inverter serial to open its saved coverage, finalize the replacement through real stock/finance helpers, show old/new serial and cost; record customer confirmation/close |
| 2:10–2:25 | D4, E comparison | View the explicitly prepared expired/no-service billed repair: 4,000 invoice versus 2,000 cost. Do not claim this bill was created live |
| 2:25–2:55 | D2/D4, director summary | Show D +12,600→−2,000, zero D receivable and pending supplier claim; D/E filtered totals, E 4,000 due, unfinished work, subsidy owner, technician pay, period controls and CSV without changing pages |
| 2:55–3:00 | All | Close on traceability, explained service and contribution; offer full evaluator path |

This is a rehearsal target, not a verified click count. At the H19 feature freeze count actual actions; complete three timed runs by H22. Start with a maximum budget of about 25 navigation/input/submit actions, not dozens of full forms. If three consecutive runs exceed 180 seconds, remove extra data-entry/navigation and identify prepared stages; keep the director questions and E comparison visible; retain their full evaluator path. Do not speed up a recording and call it live. Do not cut required implementation to fit presentation time.

No deliberate network outage or repeated login during the short pitch. Keep one invalid-state proof and concurrency-test result ready for Q&A rather than spending a minute manufacturing failures.

## 3. Full evaluator walkthrough: six to eight minutes, no hidden business writes

1. Create a new enquiry from the public form with a synthetic run-specific customer. Validate a bad email, correct it, submit, and find it in sales after refresh (R1).
2. Record qualification: roof area, bill, grid suitability, owner/follow-up. Schedule technician; enter direction, tilt and cable length (R2–R3).
3. Show quote unavailable/rejected before approval; approve survey; choose 3 kW package and inspect all component quantities (R4–R6).
4. Record customer acceptance, confirm order, inspect automatically created packing requirements and crew job, then record advance using a unique reference (R7–R9). Confirm retry creates no duplicate records.
5. Allocate actual stock; demonstrate insufficient-stock/conflicting-serial rejection in a separate test case. Scan **all** required serials; dispatch and deliver; show customer linkage and warranty dates unchanged on retry (R10–R12).
6. Record a sample field execution with valid chronological timestamps, system size, photograph and signature; complete only once requirements pass. For a new case these can be a short demonstration duration, clearly sample data; do not invent two hours of future labour for a nicer margin (R13–R15).
7. Explicitly switch to historical D. Use a fresh run-suffixed historical D variant with no posted replacement. Create/assess the ticket, reserve/scan the spare, post replacement parts/time, customer charge zero, internal replacement cost 14,600, customer-confirmed closure. Demonstrate replacement in a separate variant with old/new serial lineage (R16–R17/R19).
8. Open a fresh unbilled E variant and show expired/no-service-cover parts/labour produce a 4,000 invoice once, with 2,000 actual cost. Its original invoice is fully paid; the new repair invoice remains 4,000 due until a receipt is recorded (R18/R21).
9. Show pending jobs, subsidy next actor/evidence, technician hours/pay summary, today/week/month filters and CSV. Match figures to posted records and the documented job oracle (R20–R25).

If the evaluator grants only three minutes, show the short script and offer the full path/test evidence. Do not promise that every data-entry step was demonstrated in the short slot.

## 4. Seed arithmetic and period semantics

The [oracle](demo-seed-oracle.json) uses synthetic pre-tax management figures, not market prices or tax advice. D is a fully paid 1 kW job: invoice 55,000, material cost 40,000, installation labour 2,400, contribution 12,600. Covered replacement adds a 14,000 inverter and 600 labour, so the customer pays zero and lifetime contribution becomes −2,000. The 14,000 supplier claim remains pending, not counted as recovery. Old/new serial lineage and remaining original expiry stay visible.

E is a fully paid historical 3 kW job: invoice/receipt 180,000, material cost 120,000, installation labour 8,000. Its expired/no-service repair adds a 4,000 invoice and 2,000 cost, giving 54,000 contribution and 4,000 newly due. After both scenarios, a report explicitly filtered to D/E has invoiced 239,000, received 235,000, due 4,000, cost 187,000 and contribution 52,000. Cases A/B/C must not be mixed into this fixed headline.
Do not hardcode oracle values into reports. Real queries must calculate them from seed rows and subsequent commands. D uses two technicians × four hours × 300/hour = 2,400 installation cost and two hours × 300 = 600 replacement labour. E uses two technicians × eight hours × 500 = 8,000 installation cost and one hour × 500 = 500 repair labour. The current repair pay summary is 1,100; historical installation hours are outside that current pay period. Their old installation times are historical, not future timestamps.

Anchor relative dates once when seeding: D delivery = seed date minus 18 calendar months; E = minus 30 months; normal component duration = 24 months. Both field/financial occurrence times and record-entry times remain explicit. Rehearsals crossing midnight or November 1 must not silently move the dataset into an empty default report.

Use Asia/Kolkata half-open day/week/month intervals converted to UTC. Show period invoice/cash/cost activity separately from lifetime job contribution. A confirmed unfinished order is not completed-job profit. An old job's new repair remains in its lifetime cost even when not in its completion-month activity. The pitch selects D's job, not an unexplained company-wide total that also includes A/B/C.

## 5. Real-device and scanner gate, capability spike by H6

Current Vite binds loopback; Compose publishes app/database to loopback. A phone's `localhost` refers to the phone, not the laptop. Plain `http://<laptop-ip>` is not a sufficient browser-camera plan. `getUserMedia` requires a secure context. No phone setup is verified in the scaffold.

Choose one and record the actual device/browser result:

| Path | Setup | Acceptance / limit |
|---|---|---|
| Laptop localhost + webcam/USB scanner | Current local release; camera permission or actual keyboard-wedge scanner | Verify supported barcode format, wrong serial rejection, correct scan provenance. Manual typing is not a camera test |
| Android USB forwarding | Chrome DevTools device port forwarding from phone localhost:3001 to laptop localhost:3001; built app and DB on laptop | Verify real phone upload/signature/camera permissions; does not depend on Wi-Fi. Requires Android/USB debugging capability, so don't assume hardware availability |
| Trusted LAN HTTPS | Host-side HTTPS reverse proxy to the loopback app; phone trusts local CA, address/certificate matches, correct session/CSRF/proxy configuration | Verify secure context, login, scan/upload/signature. Do not expose PostgreSQL, disable certificate checks, or count an untrusted certificate warning as success |

The required scan set is all serialized panels, inverters, charge controllers and any battery in the selected package. On-Grid has no battery; B uses Off-Grid to exercise it. Show all required scan records, not only the representative live scan. Use tested Code 128 labels for the sample serials, a scanner Enter suffix/focus convention and an available JS decoder where camera support requires it. Never infer camera support from an untested browser API.

D2 owns connection/auth/proxy configuration, D1 controls and errors, D3 barcode checks, D4 completion evidence. First test can be a capability spike before domain APIs exist; repeat against real job/scan endpoints by H19. If no working scanner path exists, disclose the R10 gap rather than label typed entry as scanned.

Primary references: [MDN camera secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [Chrome Android USB port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server), [Caddy reverse-proxy CLI](https://caddyserver.com/docs/command-line#caddy-reverse-proxy). These document capabilities, not a phone test performed by us. HTTPS proxying is a future setup task, not a newly installed service in this pass.

## 6. Startup and mode conflict

For the current scaffold use commands from the root README. Before native `npm run dev`, stop the app container with `docker compose --profile app stop app`; DB stays running. Before Compose app startup, stop the native API/watch process. Do not kill an unrelated process that happens to use port 3001. Verify `/api/v1/health`, readiness, and a frontend deep link after choosing the mode.

Future demo seed/reset and backup helpers must be implemented and tested; they do not exist today. Seed a dedicated disposable demo DB, use run prefixes, retain/recreate staff accounts, sign in again if sessions were reset, and never add a public reset route. No reset during a judge's live session.

## 7. Rehearsal and recovery

| Gate | Evidence to record | Pass condition |
|---|---|---|
| H19 hardware | Device/browser, connection mode, scan/photo/signature evidence | Actual device endpoints persist evidence; permissions fail gracefully |
| H20.75 full path | New customer IDs, allocated serials, invoice/payment/cost IDs | R1–R25 evaluator path survives refresh |
| H19–20.75 correctness | Domain test results, concurrency winner, retry counts, oracle query output | No critical invariant failure; arithmetic reconciles |
| H19–20 cold start | Commit/image, DB/files backup, second-machine restore steps | No internet needed for prepared local release; DB and evidence match |
| H22 timed run 1/2/3 | Durations, actual action count, record switches, speakers | All three <=180 seconds with honest seeded/live labels |

No rehearsal has been performed by this documentation task. Keep a future evidence log with actual results rather than pre-checking these boxes.

On failure: wait for the current command result, retry the same idempotency key, inspect status, and announce any move to an existing record. Never silently post a second payment or repeat stock movement. If cloud/Wi-Fi fails use the prepared local/USB path. A recording is a labeled backup, not a live action. D2 owns release recovery; D4 manages the presentation clock and records limitations.

## 8. Questions to prepare for judges

- Why local PostgreSQL? Supplied requirements plus relational/concurrent stock correctness; show FKs and transaction test.
- Why this stack? Familiar patterns with explicitly tested newer majors; see technology decisions. No assertion that Next/Drizzle cannot do it.
- What prevents a double allocation? Locked availability checks plus active-unit uniqueness and one transaction, tested with two connections.
- What does free repair cost? Customer charge, company cost and supplier claim are separate records; use D's reconciled 2,000 example.
- How is revenue counted? Invoiced activity is separate from cash and completed-job/lifetime contribution; show period definitions.
- What happens on retries? Same key/body returns committed result; different body conflicts. Show actual tests after implementation.
- What did each developer do? Each explains their own commits, contracts and tests; one scaffold commit is not evidence of four contributors.
- What is incomplete? State limitations plainly: current scaffold versus future implementation, integrations deferred, customer validation and competitor absence unproven.

## 9. Director summary and screen visibility

End on one summary with selected-job contribution, open work, invoice balances, subsidy owner, technician pay, date scope and CSV on the same page. Show E's already-billed prepared ticket for comparison if the rehearsal permits; state that it is prepared. Do not claim the short script proves all R1–R25 live: R1–R3 and some payment/report operations remain full evaluator proof. Choose clips only after actual timing, rather than sacrificing the final director questions.

If using a phone, test a mirrored display (for example available Android USB mirroring) or a connected capture view so the audience can see scan/signature results. An emulator or laptop view is a disclosed fallback, not a real-phone test. No mirroring software is installed by this documentation pass.

## 10. Rehearsal proof versus implementation proof

R4/R10/R19 rejection rules are mandatory server behavior and must have actual API tests. A disabled UI action explains a gate but does not itself prove server enforcement. Keep one server refusal ready in the longer walkthrough/Q&A; the choice not to spend the short pitch on four refusals does not defer those rules. Case D's replacement is not pre-posted: valid preparation stops at ticket/part reservation/scan, so the live command must create the actual movement, lineage and cost. E is a view-only prepared comparison in the short pitch, with a fresh variant for live billing in the full walkthrough.
