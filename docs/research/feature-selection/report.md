# Sunshine feature selection: final report on 38 upgrades

Merged from independent drafts by Claude and Codex, each written before reading the other's, then cross-critiqued. 31 Oct 2026. Research only: no repo, PRD or TRD changes, and nothing here is built. The repo at `bfbcf53` has infrastructure and one `User` table.

**Decisions needed from Tuhin**

1. **Stack.** The brief calls Next.js, Drizzle and Next route handlers approved. The repo, TRD and `technology-decisions.md` use React/Vite, NestJS and Prisma, and record rejecting Next.js and Drizzle. This selection holds on either, since it's written as services, REST and SQL. But it changes every path, migration tool and setup step, so it needs one answer.
2. **Roles.** The brief's split replaces `docs/team/roles.md`, the PRD's section 7 and the task plan. We used the brief. Those documents need updating once approved.
3. **File uploads owner.** The brief doesn't assign it. We recommend D2, because it's mostly authorization.
4. **Second-person installation check.** Off by default. It changes how the company operates, so it's a business decision.

## 1. Executive summary

**Build one shared check for "what's blocking this project, and how do I clear it?" Show it on the existing order page and in the Overview queue, and return it when a command refuses. Then show each job's estimated cost against its actual cost.**

- **Smallest coherent package:** F04 + F06 + F31 + F35.
- **Recommended package:** add F07 + F32, limited to six rules, on the Overview screen the design already specifies.
- **Next, in order, only once the core works:** F17 + F20, F11, an overlap guard from F16, then test readings from F23.
- **Size:** no new pages, no engine, no alert table. The only required schema change is estimate columns on quote lines.
- **Expected effect:** staff find what's stuck and how to clear it in one place, and the director can see why a job lost money. These are hypotheses until measured. **No efficiency numbers are claimed.**

**Why this holds up:** the rules are real, and reads and commands share them. Most of the upgrade is derived from records that the baseline already requires, so there's little new state to get wrong.

## 2. Current baseline

**Authority order:** Tuhin's instructions, the PDF, supplied deliverables, PRD/PDR/TRD and the product requirements document, then research.

| Layer | Status at `bfbcf53` |
|---|---|
| Implemented | Health and readiness endpoints, shared contracts package, `User` table, build and CI |
| Specified, not built | R1–R25: enquiry to reconciled reports, including scan gates, warranty start, evidence gate, explained repair decision, serial history and lineage, confirmed closure, subsidy milestones, audit |
| Specified as P1 | Rich pending-work queue, lifecycle timeline, handover pack, template editors, confirmation link |
| Deferred in PRD | Customer portal, offline sync, payment gateway, WhatsApp and government integration, full payroll, AI |

**Already covered, so not upgrades:** F02, F03, F08, F09, F10, F18, F19, F24, F25, F26, F37, and quote revisions in F14.

**Genuine gaps:** one explained readiness view, a stored cost estimate (the docs require estimated versus actual margin, but no document says where the estimate lives), and crew overlap protection. That last one appears in no baseline document, so it must not be assumed.

**Partly committed already:** `PDR.md` defines Overview as an action queue, and the product requirements keep unfinished-work visibility in P0.

**Evidence gaps:** no buyer interviews, no product trials, no confirmed event rubric, and no seed data to measure anything against.

## 3. Real-world solar operations research

Grades: **A1** primary research or official document, **A2** independent journalism, **C** vendor claim, **X** the PDF's fictional company.

| Problem | Who feels it | Consequence | Manual process | Features | Evidence and limits |
|---|---|---|---|---|---|
| Approvals and subsidy stall | Vendor, customer | Long waits; customers blame vendors, even with legal notices | Calls and portal checks | F07, F36 | A1: World Bank draft 2025, waits up to 390 days, citing a CAG note. Dated. Software can't make a DISCOM act |
| Stock shortages | Sales, warehouse | Brand switches, or waiting with no date | Phoning suppliers | F11, F04 | A2: Mercom, Jul 2026: DCR shortage hitting timelines and inverter stock. **Headline and subhead only, paywalled; a lead, not a statistic.** That shortages are found *late* remains our inference |
| Hidden cost of free service | Director | Margin erodes unnoticed | Spreadsheets | F35 | A1: CEEW 2026, 60+ vendors: maintenance cost is built into the price. No rupee data. Benefit of variance is our inference |
| Service scope unclear | Support, customer | Disputes | Paper and memory | F06 | A1: CEEW: vendors report varying scope. A1: [Delhi's official procedure](https://solar.delhi.gov.in/page/operation-and-maintenance-procedure) says the vendor is responsible for cleaning and all-inclusive O&M for 5 years under the scheme. **Stated obligation and reported practice differ, so don't claim cleaning is excluded.** |
| Unclear who supports | Customer | Weak confidence | Phoning around | F06 | A1: KPMG 2025 |
| Weak quality checks | Owner, customer | Early faults | Varies | F23, F20 | A2: Mercom on weak checks (opening paragraph). A1: World Bank: Tata Power issues its warranty certificate only after an app-based check. **None of this proves a second-person gate is the right fix** |
| Warranty claims need records | Support | Claims stall | Hunting for paper | F24 | Manufacturer terms (SolaX, KACO, SOFAR, search summaries) ask for serial and invoice or commissioning proof. Some start warranty at commissioning; our PDF says delivery, and we follow the PDF |
| Records and commissioning | Support, owner | Disputes | Registers | F17, F23 | Guidance from Hong Kong's EMSD and the US DOE supports commissioning records. Not Indian rules |
| Repeated paperwork | Customer | Frustration | Resubmitting | F03, F09 | A1: one KPMG quote |
| Output below promise | Customer | Complaints | Manual checks | F30 | A2: Mongabay, few cases |

**Where we found no usable evidence**

- **Wrong BOMs, lost serials and enquiries, unknown blockers:** the PDF only (X). They're worth building because they're required, not because they're proven common.
- **Compatibility errors:** no study found.
- **Crew assignment inefficiency, repeat site visits, too much dashboard navigation:** vendor claims or our reasoning. First-inspection failure and truck-roll figures come from vendors or a single US court filing. **Don't quote them.**

So F31 and F17 rest on the PDF and reasoning, and should be presented that way.

**Correction for later:** `docs/research/solar/04-pain-and-evidence.md` says cleaning is usually excluded, without the Delhi contrast. Fix it when repo edits are authorised.

## 4. Complete 38-feature evaluation

Weights: demo 25%, operations 20%, engineering evaluation 20%, simplicity 15%, fit 10%, differentiation 10%. Scores are **two reviewers' independent judgements of incremental benefit, not measurements**. The mean is a plain average of the two totals. Codex independently recomputed all of Claude's original totals, and they matched.

After the critique, Claude re-based F16 and F29 to score the feature as the brief wrote it, rather than the smaller subset. No other score changed, so disagreements remain visible.

**Class:** **A** core, **B** enhancement, **C** defer, **D** merged, or baseline. D never removes a required behaviour.

| ID | Feature | Baseline | Claude D/O/E/S/F/X | Total | Codex D/O/E/S/F/X | Total | **Mean** | Class | Goes to | Incremental benefit | Main risk |
|---|---|---|---|---:|---|---:|---:|---|---|---|---|
| F01 | Contextual next actions | Partial | 8/7/6/8/9/6 | 7.30 | 7/7/7/8/9/4 | 7.05 | **7.17** | D | P1 | Next permitted step, derived from records | Hints drift from commands unless they share one check |
| F02 | One-action automation | Specified | 5/4/5/8/10/2 | 5.45 | 3/4/6/8/10/2 | 5.15 | **5.30** | D | Baseline | Small: confirmation already creates job, invoice and packing | Rebuilding a required behaviour |
| F03 | Cross-module data reuse | Specified | 3/4/4/8/10/1 | 4.65 | 3/5/5/8/10/2 | 5.15 | **4.90** | D | Baseline | None beyond a normalised schema | Not a feature |
| F04 | Installation readiness | Partial | 9/8/8/7/9/7 | 8.10 | 9/9/9/7/9/7 | 8.50 | **8.30** | A | P1 | One phase-specific gate list before the action | Gates drifting from commands; circular prerequisites |
| F05 | Operations decision engine | New abstraction | 5/5/6/5/7/5 | 5.40 | 5/6/6/4/6/4 | 5.25 | **5.33** | D | P1 (function only) | Only the shared check functions are needed | A generic rules engine |
| F06 | Explainable recommendations | Partial | 8/7/7/7/9/7 | 7.45 | 9/8/9/8/9/7 | 8.45 | **7.95** | A | P1 | Refusals name the source record and the fix | Leaking data across roles |
| F07 | Exception detection | Partial | 9/8/7/7/9/7 | 7.90 | 8/8/8/6/8/6 | 7.50 | **7.70** | A | P2 | Which projects are stuck, who holds them, for how long | Noisy rules; slow union; owner load |
| F08 | Automatic work handoffs | Specified | 4/4/4/7/9/2 | 4.75 | 4/5/7/7/10/3 | 5.75 | **5.25** | D | Baseline | Queues already read persisted state | Duplicate task tables |
| F09 | Smart form prefilling | Partial | 4/5/3/9/10/1 | 5.05 | 5/7/5/9/9/3 | 6.20 | **5.62** | D | Baseline | Editable prefill from existing foreign keys | Overwriting user edits |
| F10 | Automatic quote preparation | Specified | 3/3/3/8/10/1 | 4.25 | 4/5/6/8/10/3 | 5.70 | **4.97** | D | Baseline | None: R5 and R6 require it | Renaming a requirement |
| F11 | Inventory-aware quotes | New | 7/7/6/8/8/6 | 6.95 | 8/8/8/7/9/5 | 7.65 | **7.30** | B | E2 | Shortage visible before a date is promised | Read as a reservation unless labelled |
| F12 | Compatibility validation | New, data missing | 5/5/6/2/3/5 | 4.55 | 7/9/8/3/6/6 | 6.80 | **5.67** | C | Deferred | Weak while packages are fixed templates | Needs specs; wrong answers are unsafe |
| F13 | Smart substitution | New | 5/5/5/3/5/5 | 4.70 | 7/8/8/2/5/7 | 6.45 | **5.58** | C | Deferred | Useful in shortages, but touches price and subsidy eligibility | Approval, consent and DCR rules |
| F14 | Versioned quotes, change orders | Partial | 5/5/7/5/8/3 | 5.50 | 5/6/8/5/9/4 | 6.10 | **5.80** | D | Baseline; change orders deferred | Revisions required; change orders are the new part | Change orders touch invoices and allocations |
| F15 | Automatic cost recalculation | Partial | 5/5/5/6/8/4 | 5.35 | 6/7/8/6/9/4 | 6.70 | **6.03** | D | P3 | Frozen estimate covers the need | Recalculating history |
| F16 | Constraint-aware scheduling | New subset | 6/6/7/3/6/5 | 5.65 | 7/8/8/3/7/5 | 6.60 | **6.12** | B | E3 (overlap subset only) | Only the overlap guard is selected; it's in no baseline document. Skills, location and routing wait | Missing policy data; scope creep |
| F17 | Technician work pack | Partial | 6/7/4/7/9/4 | 6.05 | 8/8/7/7/9/5 | 7.45 | **6.75** | B | E1 | One job screen with address, parts, serials and checks | Exposing private data; heavy payload |
| F18 | Scan once, reuse everywhere | Specified | 4/4/5/8/10/2 | 5.20 | 4/6/8/7/10/3 | 6.15 | **5.68** | D | Baseline | Follows from a stable unit identity | Copying serials as text |
| F19 | Smart dispatch validation | Specified | 6/5/6/8/10/2 | 6.10 | 5/7/9/7/10/3 | 6.80 | **6.45** | D | P1 | Refusal required already; F04 adds the explanation | Two validators for one rule |
| F20 | Dynamic checklists | Partial | 4/5/4/8/9/3 | 5.20 | 6/7/7/6/9/4 | 6.50 | **5.85** | B | E1 | Requirements frozen per package type, such as Off-Grid battery checks | A checklist builder; later edits changing old jobs |
| F21 | Missing evidence detection | Specified | 6/6/5/8/10/3 | 6.20 | 5/7/8/8/10/3 | 6.75 | **6.47** | D | P1 | Completion gate required already; F04 lists what's missing | Pending uploads counted as evidence |
| F22 | Offline field capture | New | 5/6/6/1/3/6 | 4.70 | 7/9/8/2/5/6 | 6.55 | **5.62** | C | Deferred | Real need on roofs, but sync is its own project | Conflicts, device privacy, stale serials |
| F23 | Installation quality verification | New subset | 8/7/8/6/8/7 | 7.40 | 8/8/8/5/8/6 | 7.35 | **7.38** | B | E4 (evidence subset only) | Structured test readings at completion. A second-person gate needs a business decision | Adds work; a pass flag without evidence |
| F24 | Instant equipment history | Specified | 8/6/7/7/10/4 | 7.05 | 6/7/8/7/10/4 | 6.95 | **7.00** | D | Baseline, shown in demo | Required by R16 and the PRD. Built with a recursive lineage query | Ambiguous serials; slow lookup |
| F25 | Context-aware tickets | Partial | 5/6/4/8/10/2 | 5.65 | 5/7/7/8/10/3 | 6.55 | **6.10** | D | Baseline | Ticket from the serial page inherits links | Copied customer data |
| F26 | Replacement traceability | Specified | 5/5/7/7/10/3 | 6.00 | 5/7/9/6/10/4 | 6.75 | **6.38** | D | Baseline | Required already | Lost lineage; warranty reset |
| F27 | Preventive maintenance | New | 4/6/5/6/7/3 | 5.10 | 6/8/7/4/6/5 | 6.20 | **5.65** | C | Deferred | Supported by CEEW, but needs an agreement policy | Scope and capacity unspecified |
| F28 | Customer portal | Deferred in PRD | 5/5/4/2/4/3 | 4.05 | 7/7/7/3/5/4 | 5.90 | **4.97** | C | Deferred | Addresses missing updates at high cost | New auth surface; heavy frontend work |
| F29 | Maintenance, warranty reminders | New | 3/5/3/5/6/2 | 3.90 | 5/7/6/5/6/3 | 5.50 | **4.70** | C | Deferred | An in-app expiry row would be easy, but it's not one of the six rules. Real reminders need delivery | Messaging creep; consent |
| F30 | Energy performance tracking | New | 3/4/4/3/4/5 | 3.70 | 8/7/8/2/3/7 | 6.30 | **5.00** | C | Deferred | Needs metered data we don't have | Estimates presented as measurements |
| F31 | Project command center | Partial | 8/7/5/6/9/5 | 6.70 | 9/9/8/7/9/6 | 8.20 | **7.45** | A | P1 | Status, blockers and actions on the existing order page | Becoming a heavy page; data exposure |
| F32 | Exception-first dashboard | Partial | 8/7/5/7/9/6 | 6.95 | 8/8/8/6/8/5 | 7.40 | **7.18** | A | P2 | Overview opens on what needs a person. Same query as F07 | Duplicating F07 |
| F33 | Role-specific workspaces | Partial | 4/5/4/4/7/3 | 4.40 | 4/6/6/7/10/3 | 5.75 | **5.08** | D | P2 filter | A role filter on the same queue covers most of it | Multiplying pages |
| F34 | Contextual quick actions | New UI | 6/6/3/5/8/4 | 5.25 | 7/8/7/7/9/4 | 7.10 | **6.17** | D | P1 | Links from a blocker to the existing action | One drawer per action |
| F35 | Financial variance detection | Partial | 9/7/8/8/9/7 | 8.05 | 9/9/9/6/9/7 | 8.35 | **8.20** | A | P3 | Estimate versus actual by category and scope | False baseline; double counting |
| F36 | Approval, subsidy tracking | Specified | 5/6/5/7/10/5 | 6.00 | 5/7/7/7/10/4 | 6.50 | **6.25** | D | P2 rule; baseline | Required milestones gain a holder and days waiting | Implying government integration |
| F37 | Audit trail | Specified | 3/4/8/7/10/1 | 5.30 | 4/5/9/7/10/3 | 6.15 | **5.72** | D | Baseline | Required already; the timeline reads it | Logging outside the transaction |
| F38 | Technician workload balancing | New | 4/5/4/7/7/3 | 4.85 | 6/7/7/4/7/4 | 6.00 | **5.42** | D | E3 column | A hours-this-week column in the picker | Implying a fairness measure |

**Where the reviewers differ most:** Codex rates several deferred features higher, such as F12, F13, F22, F28 and F30, on potential benefit. Claude rates them lower, as support is thin. Both defer them, because of risk and missing inputs. On selected features, Codex rates F31 well above Claude (8.20 against 6.70), since Claude sees it mainly as the carrier for F04. Claude rates F07 higher (7.90 against 7.50).

**Separate technical burden, Codex's assessment.** H means more burden. BT backend depth, DB database impact, UI frontend complexity, X cross-domain, S security, M maintenance, R reliability risk, T testing, I integration, E external dependency.

| Feature | BT | DB | UI | X | S | M | R | T | I | E | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F01 | M | L | L | M | M | L | M | M | M | L | Existing guards projected, not authorized by UI |
| F02 | H | M | L | H | M | M | H | H | H | L | Atomic obligations already baseline |
| F03 | M | M | L | M | M | L | M | M | M | L | Canonical relationships prevent copy drift |
| F04 | H | L | M | H | M | M | H | H | H | L | Stage guards must match commit-time rules |
| F05 | H | H | M | H | H | H | H | H | H | L | Universal rules add needless abstraction |
| F06 | M | L | L | M | M | L | M | M | M | L | Stable safe reasons and targets |
| F07 | M | L | M | H | H | M | M | M | H | L | Scoped cross-domain query and thresholds |
| F08 | H | M | L | H | M | M | H | H | H | L | Idempotent assignment and ownership |
| F09 | L | L | L | M | M | L | L | L | L | L | Editable prefill without hidden override |
| F10 | M | M | L | M | M | L | M | M | M | L | Existing frozen pricing/BOM service |
| F11 | M | L | L | M | M | L | H | M | M | L | Read-time stock is not a reservation |
| F12 | H | H | M | H | H | H | H | H | H | H | Specs, manufacturer policy, climate inputs |
| F13 | H | H | H | H | H | H | H | H | H | H | Compatibility, prices, consents and stock |
| F14 | H | H | M | H | H | M | H | H | H | L | Accepted changes affect whole order |
| F15 | H | M | M | H | H | M | H | H | H | L | Versioned totals and rounding |
| F16 | H | H | H | H | M | H | H | H | H | M | Skills/location/duration policies missing |
| F17 | M | L | M | M | M | L | M | M | M | L | Reuse job detail, preserve private file scope |
| F18 | M | L | L | H | M | L | H | H | M | M | Physical scanner and correct identity reuse |
| F19 | H | L | M | H | M | M | H | H | H | M | Locks, scan provenance and all-or-none posting |
| F20 | M | M | M | M | M | M | M | M | M | L | Frozen package-specific requirement set |
| F21 | M | L | L | M | M | L | H | M | M | L | Uploaded facts, not pending client files |
| F22 | H | H | H | H | H | H | H | H | H | M | Device privacy and conflict recovery |
| F23 | H | M | M | H | H | M | H | H | H | M | Measurements and authorized verification |
| F24 | M | L | M | H | H | L | M | M | M | L | Scoped historical lookup |
| F25 | M | L | L | M | H | L | M | M | M | L | Server derives customer/unit identity |
| F26 | H | M | M | H | H | M | H | H | H | L | No lost lineage or reset coverage |
| F27 | H | H | M | H | M | H | H | H | H | M | Contracts, recurrence and operational capacity |
| F28 | H | H | H | H | H | H | H | H | H | M | Separate identity and tenant isolation |
| F29 | M | M | M | M | H | M | H | H | M | H | Delivery, consent, duplicate notification |
| F30 | H | H | H | H | H | H | H | H | H | H | Telemetry quality, weather and diagnosis |
| F31 | M | L | M | H | H | L | M | M | H | L | One permission-filtered read projection |
| F32 | M | L | M | H | H | M | M | M | H | L | Reuse F07 instead of another alert store |
| F33 | M | L | M | M | H | L | M | M | M | L | Server-scoped queues, not CSS security |
| F34 | L | L | L | M | M | L | M | M | M | L | Reuse routes; commands reauthorize |
| F35 | H | M | M | H | H | M | H | H | H | L | Comparable estimate/actual and unique cost sources |
| F36 | M | L | M | H | H | M | M | M | M | M | Manual applicability and private documents |
| F37 | M | M | L | H | H | M | H | H | M | L | Audit in business commit; secrets excluded |
| F38 | H | M | M | H | M | M | M | H | H | M | Availability alone does not prove fair workload |

## 5. Overlap and consolidation

| Proposed group | Verdict | Result |
|---|---|---|
| F01, F02, F05, F06, F08 | **Split.** F01 and F06 are one read model. F02 and F08 are baseline. F05 stays plain functions | P1 |
| F03, F09 | Baseline, not features | Reuse |
| F04, F19 | **Merge,** with F21. Stage-specific gates, since dispatch isn't installation | P1 |
| F07, F32 | **Merge:** F07 is the query, F32 its screen. F36 becomes a rule, F33 a filter | P2 |
| F10–F15 | **Don't merge.** F10 is baseline, F11 is separate, F14 revisions are baseline, F15 folds into F35, F12 and F13 wait | E2, P3 |
| F16, F38 | **Merge subset only:** overlap guard plus one column. Full scheduling waits | E3 |
| F17, F20, F21 | F17 and F20 go on the existing job card. F21 goes to F04 | E1, P1 |
| F18, F24, F25, F26 | **Baseline.** Don't build a second asset view | Reuse |
| F27, F29 | Both wait. A date alone doesn't define a maintenance visit | Deferred |
| F31, F33, F34 | F31 and F34 merge as the panel. F33 stays a filter | P1, P2 |

**Benefit:** one set of checks replaces F04, F05, F06, F19, F21 and part of F01. That means less duplicate logic, one API shape and clear owners.

## 6. Ranked backlog

| Rank | ID | Feature | Mean | Claude | Codex | Class | Goes to |
|---:|---|---|---:|---:|---:|---|---|
| 1 | F04 | Installation readiness | 8.30 | 8.10 | 8.50 | A | P1 |
| 2 | F35 | Financial variance detection | 8.20 | 8.05 | 8.35 | A | P3 |
| 3 | F06 | Explainable recommendations | 7.95 | 7.45 | 8.45 | A | P1 |
| 4 | F07 | Exception detection | 7.70 | 7.90 | 7.50 | A | P2 |
| 5 | F31 | Project command center | 7.45 | 6.70 | 8.20 | A | P1 |
| 6 | F23 | Installation quality verification | 7.38 | 7.40 | 7.35 | B | E4 (evidence subset only) |
| 7 | F11 | Inventory-aware quotes | 7.30 | 6.95 | 7.65 | B | E2 |
| 8 | F32 | Exception-first dashboard | 7.18 | 6.95 | 7.40 | A | P2 |
| 9 | F01 | Contextual next actions | 7.17 | 7.30 | 7.05 | D | P1 |
| 10 | F24 | Instant equipment history | 7.00 | 7.05 | 6.95 | D | Baseline, shown in demo |
| 11 | F17 | Technician work pack | 6.75 | 6.05 | 7.45 | B | E1 |
| 12 | F21 | Missing evidence detection | 6.47 | 6.20 | 6.75 | D | P1 |
| 13 | F19 | Smart dispatch validation | 6.45 | 6.10 | 6.80 | D | P1 |
| 14 | F26 | Replacement traceability | 6.38 | 6.00 | 6.75 | D | Baseline |
| 15 | F36 | Approval, subsidy tracking | 6.25 | 6.00 | 6.50 | D | P2 rule; baseline |
| 16 | F34 | Contextual quick actions | 6.17 | 5.25 | 7.10 | D | P1 |
| 17 | F16 | Constraint-aware scheduling | 6.12 | 5.65 | 6.60 | B | E3 (overlap subset only) |
| 18 | F25 | Context-aware tickets | 6.10 | 5.65 | 6.55 | D | Baseline |
| 19 | F15 | Automatic cost recalculation | 6.03 | 5.35 | 6.70 | D | P3 |
| 20 | F20 | Dynamic checklists | 5.85 | 5.20 | 6.50 | B | E1 |
| 21 | F14 | Versioned quotes, change orders | 5.80 | 5.50 | 6.10 | D | Baseline; change orders deferred |
| 22 | F37 | Audit trail | 5.72 | 5.30 | 6.15 | D | Baseline |
| 23 | F18 | Scan once, reuse everywhere | 5.68 | 5.20 | 6.15 | D | Baseline |
| 24 | F12 | Compatibility validation | 5.67 | 4.55 | 6.80 | C | Deferred |
| 25 | F27 | Preventive maintenance | 5.65 | 5.10 | 6.20 | C | Deferred |
| 26 | F09 | Smart form prefilling | 5.62 | 5.05 | 6.20 | D | Baseline |
| 27 | F22 | Offline field capture | 5.62 | 4.70 | 6.55 | C | Deferred |
| 28 | F13 | Smart substitution | 5.58 | 4.70 | 6.45 | C | Deferred |
| 29 | F38 | Technician workload balancing | 5.42 | 4.85 | 6.00 | D | E3 column |
| 30 | F05 | Operations decision engine | 5.33 | 5.40 | 5.25 | D | P1 (function only) |
| 31 | F02 | One-action automation | 5.30 | 5.45 | 5.15 | D | Baseline |
| 32 | F08 | Automatic work handoffs | 5.25 | 4.75 | 5.75 | D | Baseline |
| 33 | F33 | Role-specific workspaces | 5.08 | 4.40 | 5.75 | D | P2 filter |
| 34 | F30 | Energy performance tracking | 5.00 | 3.70 | 6.30 | C | Deferred |
| 35 | F10 | Automatic quote preparation | 4.97 | 4.25 | 5.70 | D | Baseline |
| 36 | F28 | Customer portal | 4.97 | 4.05 | 5.90 | C | Deferred |
| 37 | F03 | Cross-module data reuse | 4.90 | 4.65 | 5.15 | D | Baseline |
| 38 | F29 | Maintenance, warranty reminders | 4.70 | 3.90 | 5.50 | C | Deferred |

**Reading the ranking:** the score ranks standalone appeal, while the class reflects the decision after overlap. F23 and F11 outrank F32 yet stay enhancements, as they don't serve the core story. F32 is selected since it's F07's screen. F19 and F21 score well but are required behaviour with one extra output.

## 7. Top 10 analysis

| Feature | Why it matters | System design |
|---|---|---|
| **F04 Readiness** | Prevents a wasted truck or visit before it happens | Pure `evaluateGates(snapshot, phase)` per stage, tested by tables. Commands lock rows and re-run it. No stored readiness status |
| **F06 Explanations** | A refusal becomes an instruction | The same reason shape on reads and in 409 errors, filtered by role. Explanation can't change a guard's result |
| **F35 Variance** | Answers "why did this job lose money?" | Frozen typed estimate, actuals from posted sources. `NO_BASELINE` and incomplete states. Positive delta means adverse |
| **F31 Project view** | Less navigation, with domains keeping authority | Read-only aggregation. Single query or read-only `REPEATABLE READ` for a coherent view. Missing sections say "unavailable", never zero |
| **F07 Exceptions** | Finds which project needs attention, which a project page can't | Six read-only SQL rules owned by their domains, combined by one endpoint. Computed, so no alert table |
| **F32 Exception view** | Overview opens on what needs a person | Renders F07, sorted by severity then age. No separate API |
| **F11 Availability** | Shows shortage at quote time | Read-only: `requested`, `available`, `shortfall`, `checkedAt`, `reservation:false` |
| **F17 Work pack** | One screen for the crew | Extends the authorised job read. Dispatch scan isn't proof of installation |
| **F23 Test readings** | Commissioning records support claims | Required readings on the job card, with no new state. Doesn't change warranty start |
| **F24 History (baseline)** | R16's "within seconds" across replacements | Recursive query over the replacement link, on a stable unit ID. Disambiguates serials, which are unique only per manufacturer and product |

## 8. Best 3 individual upgrades

**F04, F31, F35.** Together they answer: can we proceed, where do I act, and what did this job really cost? F06 comes with F04 as the quality of its answer.

## 9. Best 5 individual upgrades

**F04, F06, F31, F35, F07.** F07 includes F32's screen; counting it separately would overstate the value.

## 10. Best combined package

| Package | Features | Change | Schema |
|---|---|---|---|
| **P1 Explained readiness** | F04, F06, F31 + F01, F05 (functions), F19, F21, F34 | Status read model, panel on the order page, reasons on refusals | **None** |
| **P3 Job cost variance** | F35 + F15 | Frozen estimate, variance query, drill-down | Columns on quote lines |
| **P2 Exception queue** | F07, F32 + F36, F33 (filter) | Six rules on the existing Overview | **None**; indexes |

**Smallest coherent: P1 + P3. Recommended: P1 + P3 + P2.** Schema entries are relative to the planned domain model, which isn't built yet.

**Enhancements, only after the core and P0 lifecycle work, in this order:**

| | Features | Change | Schema |
|---|---|---|---|
| **E1** | F17 + F20 | Fuller job card; requirements per package type, frozen per job | Small |
| **E2** | F11 | Availability on the quote | **None** |
| **E3** | F16 subset + F38 | Double-booking refused by the database; hours column | One constraint |
| **E4** | F23 subset | Required test readings | One small table or columns |

**Why together:** readiness stops foreseeable mistakes, the queue finds which project needs that attention, and variance shows the cost of what went wrong. All three use records the baseline already needs.

**Out of scope:** AI, any rules or workflow engine, messaging, portal, offline sync, route optimisation, government integration, generation monitoring, and a mandatory second-person gate.

## 11. Rejected, merged and deferred

| Decision | Features | Reason |
|---|---|---|
| **Merged** | F01, F05, F19, F21, F34 → P1 · F33, F36 → P2 · F15 → P3 · F38 → E3 | Same data or rule, or only a display of another feature |
| **Baseline, keep but don't count** | F02, F03, F08, F09, F10, F18, F24, F25, F26, F37; F14 revisions | Already required. Calling them upgrades would rename existing work. **They still must be built and tested** |
| **Deferred** | F14 change orders | Touch invoices, allocations and approvals |
| **Deferred** | F27 maintenance | CEEW supports the need, but no agreement policy, cadence or capacity exists |
| **Deferred** | F29 reminders | Real reminders need delivery and consent. Depends on F27 |
| **Deferred** | F13 substitution | Needs approved compatibility, repricing and consent |
| **Deferred** | F12 compatibility | Needs temperature, string and manufacturer data, and a wrong answer is unsafe. The PDF's On-Grid charge controller would also conflict with a real rule |
| **Deferred** | F22 offline | Real need, but conflict handling and device privacy are their own project. Keep retained in-memory drafts |
| **Deferred** | F28 portal | New login surface and many screens. A printable completion summary covers the essential part |
| **Deferred** | F30 energy tracking | No metered source. Estimates must not pass as measurements |
| **Deferred, rest of the feature** | F16 skills, location, routing · F23 second-person gate | Missing policy and data |

## 12. Frontend impact: Developer 1

**No new top-level pages.** Everything goes on pages the PDR already plans, using its six patterns.

| Package | Pages changed | New components | States and interactions | Testing |
|---|---|---|---|---|
| P1 | Order workspace | `NextActionPanel`, `ReasonList` | Ready, blocked, unknown, stale, forbidden; link to existing action; show 409 reasons | Each state; focus after failure; narrow screen |
| P3 | Same order's finance tab | `VarianceTable` on the summary pattern | Expand source rows; no baseline; incomplete; negative | Decimal strings displayed correctly |
| P2 | Overview | `ExceptionRow` on the list pattern | Filter, open project, empty, long list | Paging; role filter |
| E1 | Mobile job card | `WorkPackSections` | Requirements list | Phone width |
| E2 | Quote | `AvailabilityBadge` | Advisory shortage | Labelled not reserved |
| E3 | Job assignment | `CrewPicker` | Free or busy; 409 conflict | Conflict message |
| E4 | Mobile job card | Readings fields on the form pattern | Validation | Invalid values |

**Protecting D1**

- Actions link to existing forms through a known `actionId`. No per-reason drawers.
- Reasons and exception rows use one shape and one component, so a new rule needs no frontend work.
- Message text comes from the API.
- D1 builds against typed fixtures until each endpoint lands. Final screens must use real APIs.
- Following Tuhin's direction, each person may sketch rough UI for their part. D1 still owns all production frontend.
- If D1 falls behind, cut E3 and E4 first, then E2. **Don't move frontend work to backend developers.**

## 13. Backend and PostgreSQL impact

**Shared rule contract**

```text
loadSnapshot(projectId, phase, tx)      read-only; single query or REPEATABLE READ
evaluateGates(snapshot, phase, actor)   pure, no database access
  -> { status: READY | BLOCKED | UNKNOWN, asOf, sourceVersions, reasons[], allowedActions[] }
Reason = { code, phase, severity, sourceType, sourceId, ownerRole, message, actionId? }
assertPhaseReady(tx, ...)               used inside commands
```

- Phases are DISPATCH, START and COMPLETE, with no global "ready".
- Each domain supplies its own facts. The aggregator gets no write access.
- **Command order:** begin transaction → lock rows in stable order → load → evaluate → refuse with 409 and reasons, or write → commit.
- A preview can go stale through lawful concurrent changes. The command decides, and returns the current reasons.
- If a required source is unavailable, the status is `UNKNOWN`, never ready.

**Exception rules, limited to six**

| Rule | Owner | Reads |
|---|---|---|
| Enquiry follow-up overdue, or no owner | D2 | enquiry |
| Balance unpaid after completion | D2 | invoice, payment |
| Paid order not fully allocated | D3 | order, allocation, stock |
| Job past its schedule with evidence missing | D3 | job, files |
| Ticket awaiting customer confirmation past N days | D4 | ticket |
| Subsidy milestone waiting past N days, with holder | D4 | subsidy_milestone |

Thresholds are named constants. No dismiss, escalation or notification. Negative or below-estimate jobs appear on the director's job report rather than as a seventh rule.

**Schema**

P3's change to `quote_line`, in a reviewed migration. **This SQL is illustrative;** final names depend on the domain schema, which doesn't exist yet.

```sql
estimated_cost_quantity numeric(12,3) NULL,  -- materials: the line's frozen unit; labour: hours
estimated_cost_uom      text          NULL,
estimated_unit_cost     numeric(14,2) NULL,
estimate_basis          text          NULL,
CHECK (estimated_unit_cost IS NULL OR estimated_unit_cost >= 0),
CHECK (estimated_cost_quantity IS NULL OR estimated_cost_quantity > 0),
CHECK (estimate_basis IS NULL OR estimate_basis IN ('RECEIPT_AVG', 'CATALOGUE', 'LABOUR_RATE')),
CHECK ((estimated_unit_cost IS NULL) = (estimated_cost_quantity IS NULL)
   AND (estimated_unit_cost IS NULL) = (estimated_cost_uom IS NULL)
   AND (estimated_unit_cost IS NULL) = (estimate_basis IS NULL)),
CHECK (line_type <> 'PACKAGE' OR estimated_unit_cost IS NULL)
```

- **Only cost-bearing lines carry cost:** COMPONENT lines for materials, SERVICE lines for labour. That avoids double counting a package and its components.
- **Labour's hours and rate are frozen** the same way.
- **Null means `NO_BASELINE`,** never zero. No backfilling.
- **Estimates are frozen with the accepted quote.** Numeric columns give simpler typing, CHECKs and aggregation than a JSONB snapshot.
- **Incomplete estimates are reported, not summed away.** If any costing line lacks an estimate, the result is `NO_BASELINE` or `PARTIAL`, never a total that silently skips nulls.
- **Two scopes stay separate.** Initial-install estimate against same-scope actual, then later service cost.

Example, job D: estimate 42,400, install actual 42,400, same-scope delta 0. Service cost 14,600 gives lifetime cost 57,000, a +14,600 adverse delta. Contribution moves from +12,600 to −2,000. Supplier claim of 14,000 is pending and not counted.

**Enhancement schema**

| Item | Change | Notes |
|---|---|---|
| E1 | `checklist_template_item`, and a per-job frozen copy with results | Unique `(system_type, code)`; later template edits can't change an existing job; recorder is a user FK |
| E3 | `job_assignment.period tstzrange` + `EXCLUDE USING gist (technician_id WITH =, period WITH &&)` | Needs `btree_gist`. Hand-written in the migration on either ORM. Maps to 409 `TECHNICIAN_DOUBLE_BOOKED` |
| E4 | Readings on the job record or a small table | Validated numeric ranges |

**Indexes:** order and job foreign keys, `unit(normalized_serial)`, the replacement link, `subsidy_milestone(status, holder_party, waiting_since)`, partial indexes on open tickets and unpaid invoices. Check with `EXPLAIN` at about 2,400 jobs and 20,000 units.

**Ownership boundaries to make explicit**

| Boundary | Decision |
|---|---|
| Invoices and receipts | **D2** owns posting primitives: `ensureSalesInvoice(tx)`, `createServiceInvoice(tx)`, `recordReceipt(tx)`. D4's service flow calls them for chargeable repairs |
| Cost entries | **D4** owns `postCost(tx, source, job, category, amount)`, with a unique source. D3 and D4 call it |
| Warranty | **D4** owns `activate(tx, delivery)`; D3 calls it inside delivery |
| Job creation | **D3** owns `ensureJob(tx, order)`; D2 calls it |
| Replacement | **D4** orchestrates; D3 provides stock helpers |
| Files | **D2** proposed; Tuhin to confirm |
| Integration | Each owner tests their own scene. D4 coordinates the harness and local deployment only |

Primitives don't import orchestrators, and there's no `forwardRef`. No direct writes to another domain's tables.

**Workload check.** D3 is heaviest under the brief: atomic stock, field work and migrations. D4 is next: warranty, service, finance reporting and coordination. D2's platform work is large and front-loaded. So rules stay with their domains, D2 keeps the invoice write path, and D3's enhancements are optional. **We don't know that this fits; none of it is measured.**

## 14. Four-developer ownership matrix

| Feature | Dev 1 | Primary | Supporting | DB impact | APIs | Dependencies | Tests |
|---|---|---|---|---|---|---|---|
| F31 + F01, F34 | Panel on order page | **D2** | D3, D4 read interfaces | None | `GET /projects/:id/summary` | Domain DTOs, auth | IDOR; role differences; failed section |
| F04 + F19, F21, F05 | `ReasonList`, 409 display | **D3** | D2 payment facts, D4 coverage facts | None | `GET /projects/:id/readiness?phase=`; existing commands | Scans, evidence, allocations | Rule tables; read and command parity; stale race |
| F06 | Reason rows | **D3** | D2, D4 own their rule reasons | None | Reasons on reads and 409s | Rule codes | Redaction; unknown versus ready |
| F35 + F15 | `VarianceTable` | **D4** | D2 freezes estimate, D3 actual stock costs | Quote-line columns | `GET /projects/:id/variance` | Unique cost sources | Oracle match; no baseline; partial; zero |
| F07, F32 + F36, F33 | Overview queue | **D4** combines | D2, D3 own their rules | Indexes | `GET /exceptions` | Domain tables | Each rule at threshold; clears when fixed; paging |
| F17, F20 (E1) | Job card | **D3** | D2 files | Small | Extended job read | Evidence | Access; frozen copy |
| F11 (E2) | Badge | **D2** | D3 `availabilityFor` | None | In quote preview | Stock | Reserved stock excluded |
| F16 subset, F38 (E3) | Crew picker | **D3** | - | Constraint | Availability; assign | Assignments | Concurrent assign: one wins |
| F23 subset (E4) | Readings fields | **D3** | D4 reads | Small | Completion command | Job card | Validation; warranty unchanged |

### Developer 1: frontend

- **Scope:** section 12's components on planned pages.
- **Deliverables:** typed query hooks, every listed state, no status logic in the browser.
- **Depends on:** the shared `Reason` contract first.
- **Accept:** a user fixes a blocker without losing the project, and refresh shows the persisted result.
- **Tests:** component tests and one browser path.
- **Conflict risk:** changes to the error shape.

### Developer 2: CRM, sales and commercial

- **Scope:** summary aggregator and permissions, commercial reasons, estimate capture, invoice and receipt primitives, two exception rules, availability if selected.
- **Contracts:** `GET /projects/:id/summary`, the shared reason and error shape.
- **Accept:** unpaid gate refuses and clears live; retries don't double-post; technicians can't read amounts.
- **Tests:** permissions, immutable estimates, retries.
- **Conflict risk:** the API convention affects everyone, so publish it first.

### Developer 3: inventory, logistics and field

- **Scope:** phase gates and parity, row locks plus re-check, scan and evidence reasons, two exception rules, migration queue, enhancements if selected.
- **Contracts:** `GET /projects/:id/readiness`, availability and actual-cost facts.
- **Accept:** a wrong serial is refused with no stock, financial or assignment effect; a correct one clears the blocker; failure leaves no partial stock, warranty or cost.
- **Tests:** real PostgreSQL concurrency, wrong serial, incomplete evidence.
- **Conflict risk:** migration order among three authors.

### Developer 4: warranty, service and BI

- **Scope:** variance query and reconciliation fixtures, `postCost`, exceptions endpoint, two service rules, warranty helper, harness and local deployment coordination.
- **Contracts:** `GET /projects/:id/variance`, `GET /exceptions`.
- **Accept:** results match hand-reconciled records; recovery isn't counted before it's posted; a queue row appears and clears from real state.
- **Tests:** covered repair posts cost, missing estimate shows unknown, partial costs labelled, IST periods.
- **Conflict risk:** depends on everyone's tables, so agree read contracts early.

**Build order by dependency, no schedule:** shared reason contract → domain gates → read endpoints → panel. Estimate columns → cost posting → variance. Domain tables → rules → queue.

## 15. PRD addendum proposal

**Not applied.** All are additive, and R1–R25 stay.

| ID, module, type | Existing → proposed | User problem | Inputs → outputs | Rules and failure cases | Acceptance | Measure |
|---|---|---|---|---|---|---|
| **F04** Operations, EXTEND | Commands refuse → readiness shown before acting | Learning of a problem only on submit | Project, phase → status and reasons | Phase-specific. Unavailable source is `UNKNOWN`. Stale preview gets 409 | Each invalid case appears before and at submit | Screens and actions to find a blocker |
| **F06** Operations, EXTEND | Codes → source, holder and fix | Refusal doesn't say what to do | Rule facts → safe reason, link | Filtered by role. Never overrides a guard | User finds cause and fixes it | Task test on seeded cases |
| **F31** Order page, MODIFY | Separate records → one read-only view | Hunting across modules | Project, user → allowed sections, `asOf` | Missing section visibly unavailable | Same IDs and outcome, fewer transitions | Screen transitions |
| **F35** Reports, EXTEND | Margin → estimate versus actual by category and scope | Unknown cause of loss | Job → delta, completeness, source rows | No baseline isn't zero. Incomplete isn't final | Matches hand reconciliation of D | Diagnosis errors and time |
| **F07, F32** Overview, EXTEND | Unfinished list → six rules with holder and age | Chasing people | Filters → rows | Computed; no dismiss. Empty stays honest | Fixing the source removes the row | Time to list stuck work |
| *E1 F17, F20* Job card, EXTEND | Job card → fuller and per type | Details scattered | Job → requirements | Frozen per job | Off-Grid adds battery items | Navigation count |
| *E2 F11* Quote, EXTEND | None → availability | Late shortage | Quote → per-line availability | Advisory, no reservation | Shows shortage, doesn't block | Shortages found at quote |
| *E3 F16 subset* Scheduling, ADD | None → overlap refused | Double-booking | Tech, period → assigned or 409 | Database-enforced | Concurrent: one wins | Conflicts stopped |
| *E4 F23 subset* Job card, EXTEND | Evidence → plus test readings | No commissioning record | Readings | Doesn't change warranty start | Invalid refused | Records complete |

**Conflicts with current docs:** the PRD lists the richer queue as P1, and this makes a bounded version core. PRD section 7 and the TRD use old owners and the current stack. Nothing removes a baseline requirement.

## 16. TRD addendum proposal

**Not applied.** Responses use the existing `{data}` and `{error}` envelope; 409 errors gain `reasons[]`. Decimals are strings. All DTOs use shared Zod schemas. **"NO SCHEMA CHANGE REQUIRED" means relative to the planned domain schema.** Today's database has only `User`, so the baseline schema still has to be built.

| Feature | Services | API | Schema | Transaction | Auth and validation | Idempotency | Tests |
|---|---|---|---|---|---|---|---|
| F04 | `evaluateGates`, `assertPhaseReady`; D2 and D4 supply facts | `GET /projects/:id/readiness?phase=` | **NO SCHEMA CHANGE REQUIRED** | Read-only for preview; locked re-check in commands, no network under locks | Query and command both authorised | Existing keys; refused attempt consumes nothing | Unit: each rule true, false, unknown. Integration: race, rollback. E2E: wrong then right serial |
| F06 | Reason builder | Reasons on reads and 409s | **NO SCHEMA CHANGE REQUIRED** | None of its own | Role redaction. No SQL or personal data in errors | n/a | Code and message match; read and command agree |
| F31 | `ProjectSummaryService`, reads only | `GET /projects/:id/summary` | **NO SCHEMA CHANGE REQUIRED** | Bounded `REPEATABLE READ` | Project check, then scoped child queries | n/a | Child belongs to project; three roles; direct URL refused |
| F35 | `captureEstimate(tx)`; `VarianceQuery` | `GET /projects/:id/variance` → `{baseline|null, actualAsOf, completeness, estimatedCost, actualCost, delta, deltaPct|null, categoryRows, sourceRows}` | Quote-line columns, section 13 | Estimate frozen with quote or acceptance | Finance roles; no client totals | Unique cost sources | Decimals, zero estimate, repair attribution; oracle |
| F07, F32 | `ExceptionService`, read-only rule list | `GET /exceptions?kind&holder&role&limit&cursor` → `kind, recordId, holder, dueAt, ruleCode, asOf` | **NO SCHEMA CHANGE REQUIRED**; indexes | Read-only | Role scope; amounts restricted | n/a | Each rule before, at and after threshold; `EXPLAIN` |
| E1 | Extended job read | Job detail | Section 13 | Frozen when job is created | Assigned only | n/a | Frozen copy |
| E2 | `availabilityFor(lines)` | In quote preview | **NO SCHEMA CHANGE REQUIRED** | Read-only | Sales | n/a | Reserved excluded |
| E3 | `AssignmentService` | `GET /technicians/availability`; assign | Exclusion constraint | Assign in transaction | Scheduler | Existing | Concurrent assign |
| E4 | Completion command | Extends completion | Small | With completion | Numeric ranges | Existing | Warranty unchanged |

**Serial lookup (baseline):** serials are unique per manufacturer and product, so lookup returns authorised candidates when ambiguous, then uses the stable unit UUID.

## 17. Final demo

Prepared records, announced as such, with real writes. **Timing is a target to rehearse, not a measurement.** A fresh R1–R25 walkthrough stays separate. One person drives while all four speak.

| Time | Who | State | Action | Backend and records | Visible result | Why it matters |
|---|---|---|---|---|---|---|
| 0:00–0:20 | D4 | Seeded activity | Open Overview | Six rules; several tables | Rows naming holder and age, such as a subsidy with the DISCOM | No chasing |
| 0:20–0:35 | D2 | Order A at quote stage | Refused quote, then approve and create | Survey and quote gates | Refusal, then BOM with frozen estimate | PDF's approval rule |
| 0:35–1:05 | D3 | Order B paid, reserved | Open from queue; **scan a wrong serial, live** | Gate in transaction. No stock, financial or assignment effect; an audit record of the rejected attempt is allowed | Refused: not allocated to this dispatch. **Doesn't reveal another customer** | The chosen edge case |
| 1:05–1:20 | D3 | | Scan right unit; dispatch; deliver | Stock, cost, warranty | Blocker clears; warranty dates per serial | Blocker to action |
| 1:20–1:45 | D1 | Job C on site | Attempt completion; add photo and sign | Evidence check | Missing item named, then completed | Phone proof |
| 1:45–2:15 | D4 | Job D: covered replacement open | Find serial, finalize replacement | Stock, cost, lineage | Old and new linked, customer charge ₹0 | R16, R17 |
| 2:15–2:25 | D4 | Job E, already billed | View only, announced | Invoice, cost | ₹4,000 billed, ₹2,000 cost | R18 |
| 2:25–2:50 | D2 | Job D | Open variance; director summary | Query over posted rows | Estimate 42,400, actual 57,000, contribution +12,600 → −2,000 | Director's question |
| 2:50–3:00 | All | | Close | | Offer full walkthrough | |

**Edge case:** the wrong serial. For Q&A: two connections racing for one unit, `EXPLAIN` on the lineage query, and a stale preview returning 409.

**What makes it honest:** every number comes from a query, and each step traces from UI through a service to PostgreSQL. Seeded history stays labelled. No clock changes. Oracle values appear in tests only, never hardcoded in reports.

If rehearsal runs over, cut the live field upload. **Don't cut the wrong-serial refusal.** Hardware is still unknown, and no phone or scanner path has been tested.

## 18. Operational efficiency metrics

**No numbers are claimed.** Measure the same role, data and task against a baseline view, alternating order to limit learning effects. Test harness only; no production analytics. If a measured improvement is zero, simplify or drop that increment.

| Metric | Existing process | Proposed | How to measure | Test data | Evidence needed |
|---|---|---|---|---|---|
| Finding a blocker | Open order, payment, dispatch | One panel | Screens, actions, time, correct diagnosis | Unpaid, wrong serial, missing photo, missing source | Observed counts and same server decision |
| Listing stuck work | Open each module | One queue | Timed task; recall against expected list | Mixed due, healthy, hidden | Expected-case comparison |
| Invalid dispatch | Error on submit | Early reason plus refusal | Test log | Missing, wrong, reused serial; concurrent change | All refused. Whether preview helps is measured, not assumed |
| Cost investigation | Read invoice, stock, time, ticket | Variance drill-down | Errors and time | D, no baseline, incomplete, zero | Reconciliation test |
| Serial lookup | Search then open linked records | One view | Steps; response time at volume | 2,400 jobs, 20,000 units | Query plan and timings |
| Re-entry | Retype details | Prefill | Fields typed | Same customers and units | Correct links; no stale overwrite |
| Crew navigation (E1) | Separate screens | One job view | Transitions | Same technician | No access loss |
| Late shortage (E2) | At allocation | At quote | Event count | Short stock | Query |
| Double-booking (E3) | Possible | Refused | Concurrent test | Overlapping shifts | Test result |

Any commercial claim needs real installers. These only show the mechanism works on test data.

## 19. Architecture and integration risks

| Risk | Early warning | Mitigation | Owner |
|---|---|---|---|
| Stack unresolved | Two sets of framework contracts | Tuhin decides before schema work | Tuhin |
| Read and command drift | Panel says ready, command disagrees for another reason | One predicate set; parity tests; 409 shows reasons | D3 |
| Circular gates | Dispatch needs delivery | Phase-specific prerequisites; dependency test | D3 |
| Engine creep | Config-driven rules appear | Plain functions; rejected in review | D3 |
| Data leakage | Technician sees amounts, or warehouse sees another customer | Server-scoped reads; negative role tests | D2 |
| False baseline | Price used as cost; null shown as 0 | `NO_BASELINE`, typed estimate | D4, D2 |
| Double counting | Repair total plus stock consumption | Unique source keys; drill-down | D4, D3 |
| Noisy queue | Staff ignore it | Six rules only, each with a fix | D4 |
| Slow queue | Overview lags | Indexes, limits, `EXPLAIN` | D4 |
| D1 overload | New page requests | No new pages; shared components; cut order | D1 |
| D3 overload | Stock correctness slips | Core stock first; enhancements optional | D3 |
| Migration conflicts | Three authors | D3's queue; additive changes; check ORM drift on hand-written constraints | D3 |
| Overstated research | Claims of savings or exclusivity | Label hypotheses; interview installers | All |

**Critical review**

- *Less work, or more UI?* Less searching, on the current reasoning. The enhancement E4 adds entry on purpose. Nothing is measured.
- *Unnecessary abstraction?* No engine, alert table or stored status.
- *Duplicates?* Removed in section 5.
- *Could simple SQL do it?* Yes, and that's the design.
- *D1 overburdened?* Four core components on existing pages. **Page count isn't effort,** and the risk stays real.
- *Domains independent?* Mostly. Reads cross them through interfaces; writes go through primitives.
- *Transaction-safe?* Commands re-check under locks. Reads aren't guarantees.
- *Grounded in real problems?* F35 and F07 have published support. F31 rests on the PDF and reasoning.
- *Would an interviewer appreciate it?* The read and command parity, row locks, typed estimates and lineage query are easy to explain and test.
- *Useful outside a hackathon?* Probably, but validate with installers first.

## 20. Final decision

**Implement:** F04, F06, F31, F35, F07, F32. **Then, in order, if the core works:** E1, E2, E3, E4.

| Selected feature | Primary owner |
|---|---|
| F31 | D2 |
| F04, F06 | D3 |
| F35, F07, F32 | D4 |
| *F11 (E2)* | D2 |
| *F17, F20, F16 subset, F23 subset (E1, E3, E4)* | D3 |

**Merge:** F01, F05, F19, F21, F34 → P1 · F33, F36 → P2 · F15 → P3 · F38 → E3.

**Keep as baseline, don't count as upgrades:** F02, F03, F08, F09, F10, F14 revisions, F18, F24, F25, F26, F37.

**Avoid for now:** F12, F13, F14 change orders, F22, F27, F28, F29, F30, the rest of F16, the second-person part of F23.

## FINAL RECOMMENDATION

1. **Upgrades to implement.** Explained readiness (F04, F06, F31), job cost variance (F35) and the bounded exception queue (F07, F32). If only the smallest package fits, drop the queue. Enhancements afterwards: F17 + F20, F11, overlap guard, test readings.
2. **Upgrades to merge.** F01, F05, F19, F21, F34 into readiness. F33, F36 into the queue. F15 into variance. F38 into the overlap guard. F02, F03, F08, F09, F10, F18, F24, F25, F26, F37 and F14 revisions stay as baseline.
3. **Upgrades to reject or defer.** F12, F13, F22, F27, F28, F29, F30, F14 change orders, full F16, and a default second-person gate. Also any workflow engine, AI or messaging.
4. **Why this is optimal.** It exposes truth the baseline already holds, explains it where the work happens, and shows its cost. That means little new state, no new pages and clear owners. Each part makes the others more useful: the queue finds the project, readiness explains it, and variance shows the consequence.
5. **Exact system changes.**
   - One shared reason contract, added to 409 errors.
   - Phase-gate functions re-run by dispatch and completion commands.
   - Read endpoints: `/projects/:id/summary`, `/projects/:id/readiness`, `/projects/:id/variance`, `/exceptions`.
   - Four nullable estimate columns with CHECKs on `quote_line`, plus indexes.
   - Six read-only rules.
   - Nothing else required.
6. **Developer 1.** `NextActionPanel` and `ReasonList` on the order page, `VarianceTable` on its finance tab, `ExceptionRow` on Overview. Every state from section 12, typed hooks, tests. No new pages.
7. **Developer 2.** Summary endpoint and permissions, commercial reasons, estimate capture, invoice and receipt primitives, two rules.
8. **Developer 3.** Phase gates, locked re-checks, scan and evidence reasons, two rules, migration queue, concurrency tests.
9. **Developer 4.** Variance query, `postCost`, exceptions endpoint, two rules, warranty helper, reconciliation fixtures, harness and local deployment coordination.
10. **Strongest end-to-end demonstration.** Overview names a stuck order. Opening it shows why. A wrong serial is refused live with no stock, financial or assignment effect, and the right one clears the blocker. Dispatch and delivery start warranties. A historic job's covered replacement keeps old and new serials linked and charges ₹0. That same job then shows estimate 42,400 against actual 57,000, and contribution falling from +12,600 to −2,000, all from real PostgreSQL rows.

## Sources

**From the research folder:** World Bank March 2025 draft, CEEW June 2026, KPMG 2025, Mongabay August 2025 (`docs/research/solar/sources/source-register.csv`).

**New, read directly:**
- [Delhi government O&M procedure](https://solar.delhi.gov.in/page/operation-and-maintenance-procedure)

**New, partial or search summary, treat as leads:**
- [Mercom, DCR shortage, July 2026](https://mercomindia.com/dcr-module-shortage-derails-rooftop-solar-timelines-despite-strong-demand)
- [Mercom, urgent measures on DCR shortage](https://mercomindia.com/urgent-measures-dcr-module-shortage-slows-surya-ghar)
- [Mercom, quality issues under PM Surya Ghar](https://www.mercomindia.com/quality-issues-surface-in-rooftop-solar-systems-under-pm-surya-ghar)
- Warranty terms: [SolaX](https://www.solaxpower.com/blogs/solar-inverter-warranty.html), [KACO](https://solartraders.com/uploads/production/data_sheet/file/26058/Kaco%20WA%20EN.pdf?locale=de), [SOFAR](https://www.solarquotes.com.au/wp-content/uploads/2023/01/sofar-warranty.pdf)

**Cited by Codex, not re-read by Claude:** [CEEW publication page](https://www.ceew.in/publications/how-big-is-india-residential-rooftop-solar-maintenance-market), [Hong Kong EMSD](https://bestpractice.emsd.gov.hk/en/solar-photovoltaic-systems/record-documentation), [US DOE](https://www.energy.gov/cmei/femp/life-cycle-photovoltaic-systems-install-and-commission-photovoltaic-system), [SMA](https://www.sma.de/en/partners/knowledgebase/pv-inverters-basic-facts-for-planning-pv-systems), [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html).

**Deliberately not used as evidence:** [SurgePV blog](https://www.surgepv.com/blog/solar-inspection-preparation-checklist), [Switch Labs](https://verify.switchlabs.dev/industries/solar-energy), and a [US court filing](https://storage.courtlistener.com/recap/gov.uscourts.tned.108422/gov.uscourts.tned.108422.10.13.pdf) about one company.
