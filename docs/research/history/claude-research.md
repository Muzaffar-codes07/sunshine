# Solar vs Wedding: Claude's independent research

Written 2026-10-31, before reading Codex's proposal. For Tuhin and Codex.

**Recommendation: Solar, with moderate confidence.** Solar has the stronger evidence of an unserved gap, the stronger demo moment and the better team fit. Wedding is easier to build and is a credible second choice.

**Bias to discount:** an earlier session on 31 Oct also recommended Solar, so I came in anchored. The scores in section 5 are my judgement, not measurements.

## 1. What the evidence can and cannot support

- **Nobody's software is shown to be "failing".** I found no shutdown or collapse of a planner or installer software product. What I found is tools built for a different job or market. Solar has real company failures, but they are installers rather than software vendors.
- **Most comparison pages are written by sellers.** Codingclave, QuickEstimate, SurgePV, Sunbase and Maroo all sell competing products or services. Their competitor claims are leads, not facts.
- **Review samples are tiny.** G2 shows Aisle Planner 4.3 from 21 reviews and Planning Pod 4.2 from 18.
- **"Not found" is not "does not exist".** I did not test any product hands-on, so every gap below means "not shown in the sources I could read".
- **Search summaries only:** Bloomberg Law, NerdWallet, SolarReviews, ABC15, GeekWire, Down To Earth, Entrepreneur, Kerala Kaumudi, Frappe's SolarSquare story and Odoo docs. I did not read these pages in full.
- **Partly read:** Mercom is paywalled beyond its opening paragraphs. I read the first part of the Mongabay article, the Reslink guide and the QuickEstimate page, and most of Codingclave.
- **Not found:** judging criteria for this event, and any rule on reusing code from earlier projects. The official event page returned 404.

## 2. Solar

### Products out there

| Group | Examples | Built for | Gap, as far as shown |
|---|---|---|---|
| Design and proposal | Aurora, OpenSolar, Arka360, SolarPlus, Pylon | Roof design, proposals | Aurora's CRM is called thin (competitor sources). Arka360 added a CRM. Depth after handover is not shown. |
| Sales CRM | Quickest, HubSpot, Zoho, Enerflo | Lead to signed deal | Quickest's own publisher tells buyers to test PM Surya Ghar stages, field installation, commissioning and support themselves. |
| Operations hub | Scoop Solar | Connecting existing systems | Implies the typical stack is stitched together. No India evidence found. |
| Configurable ERP | Odoo, ERPNext | Everything, once configured | Needs implementation. ECOSIRE sells a solar Odoo add-on at about $349 and up, with 2-4 weeks' delivery. A search summary says SolarSquare looked to Frappe/ERPNext as a full-stack ERP replacement. |

### Why customers get hurt

1. **Warranty records die with the installer.** SunPower filed for Chapter 11 in August 2024 and ended app, portal and phone support on 20 Sept 2024. Customers were told to find their own paperwork, and monitoring through Enphase cost $699 plus tax. Manufacturers honoured some component warranties, but customers of liquidated firms lost workmanship cover. Sunnova filed in June 2025.
   - The PDF's "SunPower Solutions" is fictional. Don't let the pitch imply a link to the real company.
2. **The subsidy stalls between three parties.** Customer, vendor and DISCOM each own different steps. Reporting shows missed net-meter timelines in Rajasthan and net-meter shortages in Kerala. Mercom reported vendor complaints about subsidy delays in July 2024.
3. **"My bill went up" looks like a fault but often isn't.** Mongabay (Aug 2025) reports UP customers billed ₹12,269 and ₹22,295 for three months. An electricity metering representative blamed one case on a net meter not yet configured. One customer got ₹78,000 from the centre but was still waiting on ₹30,000 from the state.

### Gaps and solutions

Effort is my estimate. All items except S7 are additions beyond the PDF's baseline.

| # | Gap | Solution | Why it is reasonable | Effort |
|---|---|---|---|---|
| S1 | "Is this free?" is treated as one warranty question | **Two clocks.** Component warranty per serial from delivery, as the PDF says, plus a separate 5-year scheme service clock from commissioning for subsidised jobs. A ticket shows who bears the cost. | Reslink says registered vendors owe 5 years of free repair and maintenance. Under the PDF's 2-year inverter warranty, a month-30 failure is out of warranty but may still be free to the customer. Confirm against the MNRE text before quoting it. | Low |
| S2 | Subsidy tracked as vague "paperwork" | **Ball-in-court tracker.** Each job shows its stage, who must act next (customer, vendor or DISCOM) and days waiting. | Mirrors the published claim workflow. A checklist only, no portal integration. | Low |
| S3 | Field proof is not usable for claims | **One-click claim pack.** Roof form output plus serials, warranty cards and geo-tagged, time-stamped photos. Includes a 15-day countdown for defect proof. | These are the document types the guide lists. Reuses data the PDF already requires. | Medium |
| S4 | Subsidised quotes can be wrong | **Quote guardrails.** Auto-calculates ₹30k, ₹60k and ₹78k (cap at 3 kW), blocks subsidy on Off-Grid, and flags non-DCR modules. Shows effective cost separately from the upfront payment. | All are published scheme rules. Prevents a lost claim before the job starts. | Low |
| S5 | Warranty records live only with the company | **Customer warranty card.** A QR page or PDF listing serials and expiry dates, handed over at sign-off. | A direct answer to the SunPower failure. Inexpensive to build. | Low |
| S6 | "Zero power" and "high bill" tickets look alike | **Ticket triage.** A "bill or net-meter issue" type routes to a DISCOM follow-up, not a truck roll. | Based on the Mongabay cases. | Low |
| S7 | Job profit is unclear (in the PDF) | **Job P&L.** Revenue minus serial-level stock cost, technician hours and warranty repair cost. Warranty repairs reduce the original job's profit. | Shows the true lifetime margin of an installation. | Medium |

## 3. Wedding

### Products out there

| Group | Examples | Built for | Gap, as far as shown |
|---|---|---|---|
| Marketplaces | WedMeGood, WeddingBazaar | Couples, vendor leads | Not operations tools. Vendors pay per lead. |
| US planner suites | HoneyBook, Dubsado, Aisle Planner | US-style planners | No GST, UPI, WhatsApp or Hindi (per a competitor). Pricing is in dollars. Dubsado has a setup learning curve. |
| India guest tools | Weddingkart, Planorama, WappMaster | Guests, RSVP, WhatsApp | Thin or absent on vendors and payments. |
| India CRM | Plan A Wedding, Planning Studio, WeddingOS | Planner operations | **The strongest counter-evidence.** Plan A claims POs, payment milestones and GST at ₹1,999 a year. Polish and depth are unverified. |
| Custom build | Codingclave | Above 30 weddings a year | ₹3.5-8 lakh over 8-10 weeks. Its seller lists margin per wedding as scope, which hints at a packaged gap. |

### Why customers get hurt

- **Wrong category:** planners run businesses on couple apps and spreadsheets.
- **Stitching:** a guest tool, a messaging tool and accounting software rarely share data.
- **Company failure is not the story.** Weddingz was acquired by OYO, per a 2019 article. I found no comparable customer-harm event.

### Gaps and solutions

| # | Gap | Solution | Why it is reasonable | Effort |
|---|---|---|---|---|
| W1 | Quotes aren't comparable | Normalised quote lines with price per plate and hidden-cost exposure, such as the extra-hour rate | Directly in the PDF. Odoo's own Purchase Alternatives already does side-by-side comparison and cancellation. | Medium |
| W2 | Overruns are found after the event | **Variation log.** Records each extra with who approved it, the vendor cost and the client price, so 60 extra plates update margin live. | The strongest wedding idea. | Medium |
| W3 | Double or forgotten payments | Agreed amount, plus approved extras, minus advances, equals remaining payable, with a duplicate-bill guard | In the PDF. Standard accounting logic. | Low |
| W4 | Lateness is noticed too late | Live run-sheet with an auto "late" flag and a dependency warning to downstream events | Highly visual. Offline at venues is a real risk and hard to deliver in 24h. | Medium |
| W5 | Functions are treated as one event | Budget and vendors per function (Mehendi, Sangeet, Reception) | Already claimed by Plan A. Table stakes, not an advantage. | Low |

## 4. Reading the PDFs closely

Both PDFs have six scenes, so scope looks equal. The difference is in the state:

- **Solar** adds stock, serials, warranties and field work. Key rules include survey approval before quote, a BoM that expands from the kit, and a scan before dispatch.
- **Wedding** is mainly documents and money, with one live screen.

Odoo fit does not separate them. Both scenes map closely to Odoo apps, for example three caterers to Purchase Alternatives, and kits and serials to Inventory. An Odoo judge will know the standard answer in either case, so we win on the domain layer on top.

**Solar PDF ambiguities (resolve these, don't ask mid-build):**

- Panels get a 20-year clock, yet the mandatory scan list names only inverters, batteries and charge controllers. Treat panels as serialised too, since the scheme's documents also ask for module serials.
- A battery charge controller is listed under On-Grid, which looks technically odd. Follow the PDF and note it in the seed data.
- The warranty starts on delivery per the PDF, while the scheme clock starts on commissioning. S1 keeps both dates.

## 5. Scorecard

Scores are 1-5 and are my judgement.

| Criterion | Weight | Solar | Wedding | Reason |
|---|---|---:|---:|---|
| Full PDF coverage achievable in 24h | 25 | 3.5 | 4 | Wedding has a simpler data model |
| Demo strength | 25 | 4.5 | 4 | Scan, then month 18 vs month 30 decides free or billed. Wedding day is more emotional, but harder to make feel real. |
| Evidence of an unserved gap | 20 | 4.5 | 3 | Scheme rules give concrete features. India wedding CRMs already claim much of this. |
| Engineering depth | 15 | 4.5 | 3.5 | Serial traceability and warranty logic vs bill reconciliation |
| Team fit | 15 | 4 | 3 | Inventory-ledger experience |
| **Weighted total out of 100** | | **83.5** | **71.5** | |

**Wedding wins instead if** the team's strength is mostly frontend with little backend time, or if anyone on the team has real wedding-agency contact. Either would change the scores above.

## 6. What would make Solar fail

| Risk | Mitigation |
|---|---|
| Stock, field and subsidy work consume the whole 24h | Build the PDF's six scenes first. Add in order S1, S4, S2, S5, then S3 and S6 only if time remains. |
| Subsidy scope creep | Checklist only. No portal integration. |
| Phone camera and geolocation need HTTPS | Deploy early or use a tunnel, and keep typed serial entry as a fallback. |
| "18 months later" is hard to show live | A demo-date control or seeded back-dated deliveries, shown openly as simulation. |
| Many teams may pick Solar | Unknown. S1-S3 are the differentiators. |

## 7. To confirm with the leader or evaluator

1. Which problem has the leader selected? Only the leader can select.
2. May code from earlier projects be reused? This is unconfirmed.
3. Must the build be on Odoo itself? The PDFs say only "one unified software platform".

## Sources

**Solar**
- [Reslink PM Surya Ghar guide for EPCs](https://www.reslink.org/blogs/pm-surya-ghar-muft-bijli-yojana-the-complete-2026-guide-for-solar-epcs/) (seller, but detailed; updated Oct 2026)
- [Mongabay India, Aug 2025](https://india.mongabay.com/2025/08/rooftop-solar-dreams-turn-sour-for-consumers/)
- [Mercom on subsidy delays, Jul 2024](https://mercomindia.com/rooftop-solar-vendors-complain-of-subsidy-delays) (paywalled)
- [Down To Earth on Rajasthan](https://www.downtoearth.org.in/amp/story/renewable-energy/shadows-over-solar-rajasthans-pm-surya-ghar-yojana-faces-implementation-issues)
- [Entrepreneur on Rajasthan](https://india.entrepreneur.com/news-and-trends/rajasthan-faces-several-challenges-in-pm-surya-ghar-yojana/475590)
- [Kerala Kaumudi on net-meter shortage](https://keralakaumudi.com/en/kerala/general/state-faces-shortage-of-solar-net-meters-pm-surya-ghar-subsidy-applications-flood-in-1279890)
- [Bloomberg Law on solar bankruptcies](https://news.bloombergtax.com/california-brief/solar-panel-bankruptcies-leave-frustrated-homeowners-in-limbo)
- [NerdWallet on SunPower](https://www.nerdwallet.com/article/mortgages/sunpower-bankruptcy)
- [SolarReviews on SunPower](https://www.solarreviews.com/blog/what-sunpower-customers-need-to-know-about-bankruptcy)
- [ABC15 on SunPower](https://www.abc15.com/news/let-abc15-know/what-customers-need-to-know-about-sunpower-after-company-files-for-bankruptcy)
- [Stellar Solar on Sunnova](https://stellarsolar.net/2025/06/11/sunnova-solar-bankruptcy-what-to-do-now/) (installer blog)
- [GeekWire on Omnidian and Sunnova](https://www.geekwire.com/2025/seattle-solar-servicing-company-omnidian-to-pay-7m-for-a-slice-of-bankrupt-sunnovas-business/)
- [QuickEstimate India solar CRMs](https://quickestimate.co/best-solar-crm/india) (seller)
- [SurgePV on Arka360](https://www.surgepv.com/reviews/arka360) (competitor)
- [Sunbase on Aurora](https://sunbasedata.com/blog/aurora-solar-in-2025) (competitor)
- [Frappe on SolarSquare](https://frappe.io/stories/Solar%20Square%20Pvt%20Ltd) (vendor story)
- [Scoop Solar profile](https://www.cbinsights.com/company/scoop-solar/alternatives-competitors)
- [ECOSIRE solar add-on](https://ecosire.com/apps/odoo/solar-energy-systems) (seller; a localised page of this listing was seen)

**Wedding**
- [Codingclave India comparison](https://codingclave.com/guides/best-wedding-planner-software-india-2026) (seller, discloses it)
- [Planning Studio](https://www.softwaresuggest.com/planning-studio)
- [WeddingOS](https://weddingos.duckdns.org/)
- [G2 Aisle Planner vs Planning Pod](https://g2.com/compare/aisle-planner-vs-planning-pod)
- [Capterra Dubsado reviews](https://capterra.com/p/206389/Dubsado/reviews/?page=3)
- [YourStory, 2019, on the wedding market](https://yourstory.com/2019/04/online-wedding-platform-wedmegood-funding)
- [ECOSIRE wedding add-on](https://ecosire.com/apps/odoo/events-wedding-management) (seller)

**Odoo**
- [Odoo 19 call for tenders](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html)
- [Internshala event listing](https://internshala.com/competitions/?p=11189)
