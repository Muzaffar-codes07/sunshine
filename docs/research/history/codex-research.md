# Independent assessment: Wedding vs Solar

Author: Codex. 31 October 2026. Written before opening Claude's assessment.

## Recommendation

Recommend **Wedding Planning Management System**, conditional on team skills and the actual judging rubric. It has the safer complete 24-hour demo and a readily understood money-loss story. Solar is a good alternative if the team already has working inventory and asset-service primitives. This is a recommendation for the team leader, not a selection or build authorization.

The distinction is delivery risk, not market emptiness. Both are mature categories. Do not pitch either as the first unified platform. No evidence collected here establishes that incumbent businesses are failing.

## What the supplied PDFs actually require

Wedding: The Royal Knot handles about 25 three-day luxury weddings per season, 400+ guests each, roughly 18 vendors, and staged client payments. Six scenes cover enquiry and signed agreement; line-by-line caterer comparison and closing alternatives; deposit-triggered 25+ task template; live schedule and vendor arrival; advances, final bills and extras; season profitability and cash due. Source: `/home/pu7in/Downloads/Wedding_Planning_Management_System.pdf` (read directly using pdftotext).

Solar: SunPower completes about 40 rooftop jobs/month with 15 technicians. Six scenes cover qualification and approved survey before quotation; templated 1–5 kW on/off-grid kits; confirmation generating packing and scheduled work; serialized dispatch and delivery-triggered warranty; mobile photos/time/signature; warranty-aware repair and billing; profit, unfinished work, subsidy paperwork and reporting. Source: `/home/pu7in/Downloads/Solar_Installation_Management_System.pdf` (read directly using pdftotext).

Neither brief asks for an AI chatbot, a vendor marketplace, engineering-grade solar simulation, or live government integration. Those would distract from the required lifecycle. The solar package descriptions should be treated as fictional business catalogue requirements, not installation engineering advice.

## Existing products: verified overlap and bounded gaps

| Product | What its own published material establishes | Consequence |
|---|---|---|
| [Aisle Planner](https://help.aisleplanner.com/en/articles/1899152-aisle-planner-subscription-plan-options) | Offers budgets, timelines, vendor/contact management, guest tools, seating, reminders and project-based plans. | Wedding checklists, budgets and vendor records are established capabilities. An integrated planning pitch alone is weak. |
| [HoneyBook](https://www.honeybook.com/pricing?placement=t) | Offers client projects, proposals, contracts, invoicing and workflow features. | Signing plus payments is baseline, not differentiation. Do not infer India availability from generic pricing; region and payment rails require separate verification. |
| [Odoo Wedding Planner](https://www.odoo.com/industries/wedding-planner) | Connects CRM, quotes, contracts, sales-created projects, tasks, timesheets, milestones and profitability. | Particularly relevant competitor for an Odoo-run event. Novelty must be in domain workflow and execution. |
| [Odoo alternative RFQs](https://www.odoo.com/documentation/16.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html) | Documents vendor offer comparison and cancellation of alternative requests. This is a version-16 example, not verification of every newer edition. | Side-by-side bids and closing losers are existing ERP patterns. Contextual menu/inclusion normalization and approval trace could still improve agency usability. |
| [OpenSolar](https://www.opensolar.com/post/is-opensolar-really-free/) and [project actions](https://support.opensolar.com/hc/en-us/articles/11007480707599-How-to-Customize-Project-Tags-and-Actions) | Advertises free core design, sales and project management; documents configurable actions and stages. | Neither low price nor project stages is a defensible solar novelty. These sources do not establish full inventory or warranty-service coverage. |
| [Aurora](https://docs.aurorasolar.com/reference/key-terms) | Documents roof/panel design, performance, pricing, proposals and integrations. Some APIs require its Business plan or add-ons. | Avoid competing on design/simulation in 24 hours. This is primarily evidence for design capability, not absence of operations. |
| [Odoo Solar](https://www.odoo.com/industries/solar-energy) and [official industry module](https://apps.odoo.com/apps/modules/18.0/solar_installation) | Publishes lead, installation, mobile field-service, helpdesk and invoicing workflows. Industry module lists inventory, repairs and accounting dependencies and requires Enterprise. | Solar is also an existing integrated ERP vertical. Stock/service integration is not unprecedented. Dependency count illustrates scope, not proof of poor UX. |
| [Zoho FSM assets](https://www.zoho.com/fsm/assets.html) | Tracks customer assets, installation dates and warranty information for service decisions. | Warranty-aware service is an established pattern. |
| [SolarBuddy inventory](https://www.solarbuddy.in/solar-inventory-software) | Vendor claims Indian solar serial scanning and customer/serial lookup with warranty documents. | Even India-specific serial traceability is not an empty niche. Claims were not independently product-tested. |

These are primary sources for feature existence. Vendor marketing does not prove reliability, customer outcomes, actual adoption, or the absence of unlisted features. No paid products were tested and no customer interviews were conducted. Avoid blanket statements that competitors lack a feature because their landing page omits it.

## Why the fictional agencies still struggle; realistic responses

The PDFs establish fragmented records and missed handoffs at the fictional companies. They do not establish why real buyers fail to adopt incumbent software. Training burden, migration cost and weak mobile use are plausible hypotheses to validate, not findings.

For wedding, build an exception-first operations view around one wedding record: compare normalized plates, inclusions, overtime, exclusions and totals; preserve original quote attachment; explicitly approve the winning vendor; create the plan once after confirmed deposit; capture a late vendor and assign the response; record the extra 60 plates with approval and show both cost and client charge. The business payoff is explainable: uncontrolled extras and double-paid advances directly reduce margin. Do not claim automatic understanding of arbitrary PDFs; structured input and attachments satisfy a reliable demo. Human-confirmed extraction can be a stretch.

For solar, a credible focus is an asset history tying approved survey, kit revision, dispatched serial, customer acceptance, warranty and repair outcome. Reject duplicate serial allocation, show why an asset is covered, retain replacement history, and show who owns blocked jobs. This is useful execution of known ideas. Do not claim integration gaps are solved until real system connectors exist.

## 24-hour comparison

Heuristic scores, 1–5 (higher is better), assuming a small full-stack team starting fresh. These are delivery judgments, not measured market facts or official judge scores.

| Criterion | Wedding | Solar | Reason |
|---|---:|---:|---|
| Complete required lifecycle in 24h | 4 | 2 | Solar needs stock movements, unique asset identity, warranty transitions and repair billing. |
| Clear 4-minute demo | 5 | 4 | Extra plates reducing margin and a late vendor are immediately legible; serial warranty is also strong. |
| Manageable data correctness | 3 | 2 | Both involve money; solar adds asset reassignment/replacement history and delivery semantics. |
| Domain workflow differentiation | 3 | 3 | Both heavily overlap incumbents. Workflow coherence must carry the demo. |
| Business-process depth for an Odoo-style event | 4 | 5 | Solar spans more ERP modules, but this is inferred relevance; the real rubric is unknown. |
| Accessible visual presentation | 5 | 4 | Wedding has strong event timeline and quotation comparisons without engineering visualizations. |

I do not sum these as if weights were known. If rubric heavily rewards inventory/ERP depth or the team already has that infrastructure, solar can win.

## Proposed wedding build boundary (pending owner approval)

Deliver a persistent web app with planner and founder views plus a limited client approval/signing view. Keep six coherent scenes navigable from one wedding; seed the other season weddings for portfolio reporting.

1. Capture lead, meeting, agreement file and simple phone signature with timestamp. Present this as demo acceptance evidence; do not promise a jurisdiction-specific legal signature standard.
2. Compare three structured caterer quotes at 400 guests. Select exactly one atomically; archive the losing requests and preserve the comparison.
3. Mark booking deposit received, create the 25+ task plan exactly once, and show the staged receivable schedule. Record payment references; avoid live payment integration.
4. Show Mehendi/Sangeet/reception timeline, expected versus actual vendor arrival, late status, owner and incident actions.
5. Enter 60 extra plates, require approval, reconcile vendor advance against total bill and block duplicate payment reference. Show outstanding balances.
6. Display estimated, committed and actual margin distinctly, with client revenue minus vendor costs and recorded internal hours at an explicit cost rate. Show cash received and cash due separately from profit. Provide CSV export.

Suggested sequence: 0–2h schema, seeded scenario and navigation; 2–7h enquiry/quotes; 7–11h deposit/project automation; 11–15h event timeline and incidents; 15–19h extras/bills/report; 19–22h integration and mobile polish; 22–24h verification and demo rehearsal. Re-estimate from remaining time, rather than pretending the full 24 hours remain.

High-value verification: quote selection cannot create two winners; repeated deposit action cannot create duplicate plans; vendor advance is deducted once; the 60-plate example changes both cost and client charge correctly; unauthorized client cannot read another wedding; portfolio figures reconcile to wedding detail; data survives refresh. Check each critical flow with real writes rather than static screenshots.

## Information needed before committing

Actual evaluation rubric and required stack; team size and strengths; current implementation progress; whether Odoo use is mandatory; remaining time. These determine whether the recommendation reverses. Do not block the research on them, but ask the owner before making the selection or starting an unapproved implementation task.
