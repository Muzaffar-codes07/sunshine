# Market research: Solar and Wedding

Written by Claude on 2026-10-31, extending `claude-research.md`. Cross-reviewed by Codex, whose corrections are applied. Architecture: `merged-architecture.md`.

**Is the market research complete? As public desk research, yes, with limits. As validated research, no.** It covers products, gaps, pain and solutions for both problems. We did no interviews or product trials, so we can't confirm how much the gaps matter to buyers or why anyone leaves a product.

| Tuhin's item | Before this round | Now | What is still missing |
|---|---|---|---|
| 1. Products already out there | Partial | Good at desk level | No hands-on product testing |
| 2. Gaps | Partial | Partial | Some operational gaps have published evidence; proposed competitor feature gaps remain mostly "not shown in sources" and have not been confirmed through our own user validation |
| 3. Solutions | Partial | Done as proposals | Not validated with users |
| 4. Why products fail, and the pain | Weak | Partial | No churn data or interviews. Real pain is documented, but product failure mostly is not. |
| 5. New architectures | Missing | Merged and cross-reviewed | Known patterns applied to these scenarios. Not built or tested. |

## How to read the evidence

| Grade | Meaning |
|---|---|
| **A** | Independent research or journalism. Original studies carry more weight than news reports, and the source list says where we read only a summary, which is weaker. |
| **B** | A published user complaint. It is testimony from one person, not a confirmed defect. |
| **C** | Vendor, seller or competitor claim |
| **X** | Fictional company in the PDF, or our own hypothesis. **Never present as market fact.** |

**Numbers not to use.** I couldn't trace these to a primary source:
- "40% of installers gone by 2023" attributed to JMK Research. I searched and did not find it in JMK's published material.
- "60% of service calls are inverter faults".
- "3-8 weeks to resolve inverter faults".
- "38% of weddings go over budget" (attributed to CAIT).
- "11% vendor no-show rate" (attributed to BookEventz).

## Solar

### Products

| Product | Focus | What is claimed | Grade |
|---|---|---|---|
| Solar Ladder | Indian operations platform | Its [homepage](https://www.solarladder.com/) lists projects, proposals, design, tasks and cost tracking, and claims 600+ companies. O&M, procurement and finance come from a competitor's review, not checked on its own pages. | C |
| SolarBuddy | Indian stock and serials | Phone scanning, ALMM/DCR tracking, BoM deduction, warranty lookup by serial | C |
| Arka360 | Indian design with CRM | Design, proposals, CRM. Reported about ₹46,000 a year per user. | C |
| OpenSolar | Free design and sales | Free core. A competitor says subsidy and ALMM handling is manual. | C |
| Quickest | Indian sales CRM | Proposals, WhatsApp. ₹6,999 per user a year. | C |
| Solarflow | Indian CRM | Scheme slabs, expected vs received subsidy (search summary only) | C |
| Aurora | Design | Roof design and performance. CRM reportedly thin. | C |
| Odoo Solar | ERP vertical | Leads, installation, mobile field service, helpdesk, invoicing, repairs | C |
| Zoho FSM | Field service | Customer assets with warranty data | C |
| ERPNext | Custom ERP | SolarSquare's story on Frappe (search summary only) | C |

**Correction to my earlier work:** Solar Ladder is an Indian operations-first competitor. Its own homepage supports broader project and cost workflows; O&M coverage is reported by a competitor and remains unverified. This weakens my earlier view that tools generally stop at the sale.

### The pain

| Pain | Evidence | Grade |
|---|---|---|
| Subsidy payments run very late, and vendors get blamed | World Bank draft assessment, March 2025, citing a CAG audit note: processing should take 15 days after DISCOM approval, yet 3,314 beneficiaries waited 99 days, 3,024 waited 100+ days, and the longest wait was 390 days. Stakeholders said customers without subsidies blame vendors and send them legal notices. The note also says the portal has no tracking and verification systems. The cited delays predate this report, and the portal may have changed since. | A |
| Service after installation is reactive and its scope is unclear | CEEW, June 2026, consulted 60+ vendors across states. The 5-year free maintenance is well known, but what it includes varies widely. Cleaning is usually excluded. Service mostly follows customer requests. Most vendors say the cost is built into the install price. | A |
| Customers don't know who provides support | KPMG India CX Report 2025 reports poor alignment between integrator and panel maker on support, a 15-day meter delay complaint, and repeated document submission. It also reports strong ratings for installation and delivery. Sample size not shown on the page. | A |
| Households struggle to judge vendors | WRI surveyed 1,808 households in five cities. 69% in Chennai and 47% in Bengaluru had trouble verifying vendor trust or price; under 35% elsewhere. **Published around 2018-19, before PM Surya Ghar.** | A |
| Bills confuse customers and get blamed on the system | Mongabay, Aug 2025: UP customers billed ₹12,269 and ₹22,295. A metering representative blamed one case on an unconfigured net meter. | A |
| Subsidy gets stuck between parties | Mongabay: central ₹78,000 received, state ₹30,000 still pending. Mercom, 2024: vendors complain of delays (mostly paywalled). | A |
| Output below what was promised | Mongabay: 5-6 units a day against 13 promised. Officials also cite substandard equipment. | A |
| Installer failure strands customers | US: SunPower and Sunnova. India: only seller blogs on "abandonment". | A (US), C (India) |
| Unclear service terms after the sale | Consumer complaint: a Vijayawada customer charged ₹3,500 per site visit, with no support period stated in the quote. One case, unverified. | B |
| No standard service time for inverters | An inverter seller says warranties promise "reasonable time" and that no audited national fault rate exists | C |

### Why products fail

**Not established.** We found no Indian solar software shutdown, churn figure or switching study. What we can say:
- **Installers failed, not software.** SunPower and Sunnova are installer and finance failures.
- **Coverage is split by product.** Design-first, sales-first and operations-first tools all exist. Competitors say each is thin outside its focus, but they are biased (C).
- **Hypotheses only (X):** field staff stop using the CRM, and pricing per project is hard to predict.

### Gaps and solutions

| Gap | Status | Solution |
|---|---|---|
| Serial scan and warranty lookup | **Already claimed** by SolarBuddy, Zoho and Odoo | Required by the PDF. Not a differentiator. |
| Subsidy tracking | **Already claimed** by Solarflow | Next-owner view shows who must act |
| Who pays for a repair, with reasons | Not shown | Coverage decision recorded with its rule and date |
| Customer holds their own records | Not shown | Self-contained handover pack |
| Repairs reduce the original job's profit | Not shown; Solar Ladder has cost tracking | Job-tagged money ledger |
| High-bill complaint vs system fault | Not shown | Ticket type suggests routing, and staff record the assessment. A high bill can coexist with a fault, so nothing is auto-closed. |
| Service terms clear at sale | Not shown | Coverage stated on quote and handover |

## Wedding

### Products

| Product | Focus | What is claimed | Grade |
|---|---|---|---|
| Aisle Planner | Planner project tool | Timelines, budgets, vendors, seating. $49.99-$229.99 a month. | C |
| HoneyBook | Client CRM and payments | Contracts, invoices, automation. $29-$109 a month on annual billing. | C |
| Dubsado | Custom workflows | Forms and automation | C |
| Planning Pod | Event operations | Entry about $19.99 a month | C |
| Plan A Wedding | Indian CRM | Vendor sub-CRM, POs, milestones, GST, multi-function budgets. ₹1,999 a year. I couldn't find its own page. | C, single source |
| Planning Studio | Indian planner suite | Vendor CRM, budgets, GST billing, client portal | C |
| WeddingOS | Indian operations | Vendor payment status and deadlines | C |
| Weddingkart, Planorama, WappMaster | Indian guest tools | RSVP and WhatsApp. Thin or absent on vendors. | C |
| WedMeGood, WeddingBazaar | Marketplaces | Vendors pay for leads. Not operations tools. | C |
| Odoo Wedding Planner | ERP vertical | CRM, quotes, signing, projects, timesheets, profitability | C |
| Odoo Purchase | ERP | Compares RFQs and cancels the alternatives | Official docs |

### The pain

| Pain | Evidence | Grade |
|---|---|---|
| Price rises on small businesses | HoneyBook's Starter plan rose sharply in 2025 (reported from $19 to $36 monthly). Users complain on Trustpilot and HoneyBook's own forum. | A (Fstoppers), B |
| Weak team access | A planner on HoneyBook's forum says their admin must log in under the planner's account, and is considering Aisle Planner | B, one user |
| Billing errors | One reviewer of Aisle Planner alleges truncated bank details, a failed ACH and a $50 fee. Only 2 reviews exist there, and the cause is unverified. | B, one user |
| Couple pays, vendors go unpaid | Singapore couple paid S$16,000 more to vendors after paying their planner in full (Mothership, summary). Similar US case on CBS. | A, not India |
| Late payments hurt vendors | South Asian wedding podcast by a planner (description only) | B |
| Cash shocks hit the vendor chain | Bengaluru planners during demonetisation struggled to pay decorators and caterers (Deccan Herald, 2016, summary) | A, dated |
| Enquiries, quotes and notebooks at The Royal Knot | The PDF only | **X** |

**The weakest area:** I found no interview with an Indian planner and no independent data on margins, overruns or vendor no-shows.

### Why products fail

**Partly established, and only for price and fit:**
- **Price rises caused real complaints** at HoneyBook. Whether they caused meaningful churn is unknown, since the "moving to alternatives" claims are anecdotal.
- **India fit:** US tools reportedly lack GST, UPI and WhatsApp, but that claim comes from a seller (C), and Codex removed it from the merged document for that reason.
- **Marketplaces serve a different job.** Vendors pay them for leads, so they don't run agency operations.
- Weddingz being acquired by OYO is not evidence of failure.

### Gaps and solutions

| Gap | Status | Solution |
|---|---|---|
| Side-by-side vendor quotes | **Exists in Odoo Purchase.** Not shown in wedding tools. | Compare quotes by total cost at any guest count |
| Tracking vendor payments | **Already claimed** by Plan A and WeddingOS | Required by the PDF. Not a differentiator. |
| Extras with cost and client price together | Not shown | Variation log tied to both sides |
| Margin at each stage | "Profitability" claimed by Odoo; stages not shown | Estimated, committed and actual margin |
| Live late-vendor detection | Not shown; timelines are common | Run-of-show with lateness and knock-on warnings |
| Couple can see vendors were paid | Not shown | Client statement of pass-through payments |

## Comparison

| | Solar | Wedding |
|---|---|---|
| Independent evidence of pain | Stronger, including an Indian survey and journalism | Thin, mostly foreign or dated |
| Evidence of competing products | Stronger, more than I first found | Strong |
| Evidence of product failure | None | Limited to price complaints |
| Scope of unproven gaps | Coverage decision, portable records, lifetime job profit | Variations, margin stages, knock-on delays |

### Effect on the recommendation

The new evidence pulls in two directions. Solar Ladder means more competition, while the World Bank, CEEW and KPMG sources show stronger real pain in Solar. **Stronger pain doesn't prove an unserved software gap**, and a database can't supply missing technicians or make a DISCOM act.

I'm withdrawing the rescoring I posted to Codex (Wedding 74 vs Solar 79 or 71). Moving invented scores with each new source suggests precision that doesn't exist. The conditions in `recommendation.md` are the better guide.

## Sources

**Independent or primary**
- [World Bank draft ESSA, March 2025](https://documents1.worldbank.org/curated/en/099032925033036806/pdf/P508489-0fa8a91c-4052-4cce-b4da-ce6d805cf5c6.pdf) (relevant passages read; found by Codex)
- [CEEW O&M report, June 2026](https://www.ceew.in/sites/default/files/ceew-oandm-ecosystem-for-rts-web-ready-file.pdf) (findings section read; found by Codex)
- [KPMG India CX Report 2025](https://kpmg.com/in/en/insights/2025/03/india-cx-report-2025/power-and-utility/rooftop-solar-providers.html) (found by Codex)
- [WRI India: Here Comes the Sun](https://wri-india.org/publication/here-comes-sun) (PDF read)
- [Mongabay India](https://india.mongabay.com/2025/08/rooftop-solar-dreams-turn-sour-for-consumers/) (partly read)
- [Mercom](https://mercomindia.com/rooftop-solar-vendors-complain-of-subsidy-delays) (paywalled)
- [Fstoppers on HoneyBook pricing](https://www.fstoppers.com/business/honeybooks-price-hike-coming-heres-what-need-know-and-how-save-690584) (summary)
- [Mothership, Singapore](https://mothership.sg/2026/07/wedding-planner-scam-package/) (summary)
- [CBS News](https://www.cbsnews.com/losangeles/news/couple-says-local-wedding-planner-took-money-bailed-days-before-ceremony/) (headline)
- [Deccan Herald](https://www.deccanherald.com/india/karnataka/bengaluru/with-little-cash-wedding-plans-2095915) (summary)
- [Odoo Purchase docs](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html)

**User testimony**
- [HoneyBook forum: price rises](https://community.honeybook.com/business-talk-46/disappointed-by-recent-price-hikes-a-tough-blow-for-small-businesses-4320)
- [HoneyBook forum: team access](https://community.honeybook.com/talk-product-7/better-client-managemeng-system-for-event-professionals-5069)
- [HoneyBook on Trustpilot](https://www.trustpilot.com/review/honeybook.com?page=6) (summary)
- [Aisle Planner on Software Advice](https://www.softwareadvice.com.au/software/114657/aisleplanner) (summary)
- [Consumer complaint, Vijayawada](https://www.consumercomplaints.in/s-cube-energy-and-infra-pvt-ltd-sales-after-service-of-rooftop-solar-plant-c3544506)
- [The Planner's Perspective podcast](https://theplannersperspective.buzzsprout.com/2571311/episodes/18646714-the-real-reason-vendors-require-final-payment-before-the-event)

**Vendors, sellers and competitors**
- [Solar Ladder review](https://www.heavengreenenergy.com/blog/solar-ladder-review) (by a competitor's sister site)
- [SolarBuddy](https://www.solarbuddy.in/solar-inventory-software)
- [OpenSolar and others, QBits](https://qbitsenergy.com/blog/solar-design-software-india/)
- [QBits on service times](https://qbitsenergy.com/blog/service-sla-crisis-solar/)
- [Heaven Green on abandonment](https://www.heavengreenenergy.com/blog/solar-installer-abandoned)
- [Solarflow subsidy tracker](https://www.fuzen.io/posts/solarflow_subsidy_tracker) (search summary; the page redirected when opened)
- [Codingclave wedding comparison](https://codingclave.com/guides/best-wedding-planner-software-india-2026)
- [Planning Studio](https://www.softwaresuggest.com/planning-studio)
- [Odoo Solar](https://www.odoo.com/industries/solar-energy)
- [Odoo Wedding Planner](https://www.odoo.com/industries/wedding-planner)

Other sources are listed in `claude-research.md` and `codex-research.md`.
