# Pain and evidence

We did no interviews or product trials. Real pain below comes from published sources. **Pain doesn't prove a software gap:** a database can't make a DISCOM act or supply technicians.

## Evidence grades

| Grade | Meaning |
|---|---|
| **A1** | Original research or official-programme document, where we read the relevant passage |
| **A2** | Independent journalism |
| **B** | One published user complaint. Testimony, not a confirmed defect. |
| **C** | Vendor or seller claim |
| **X** | The PDF's fictional company, or our own hypothesis. Never present as market fact. |

## What is documented

| ID | Pain | Evidence | Who feels it | Grade | Limits |
|---|---|---|---|---|---|
| P1 | Subsidies arrive very late | World Bank draft assessment, March 2025, citing a CAG audit note: processing should take 15 days after DISCOM approval, yet 3,314 beneficiaries waited 99 days, 3,024 waited 100+ days, and the longest wait was 390 days | Customer, vendor | A1 | Predates this report. Portal may have improved. |
| P2 | Customers blame vendors for government delays | Same report: stakeholders said customers without subsidies blame vendors and send legal notices | Vendor | A1 | Stakeholder statement, no count |
| P3 | The scheme portal has been a bottleneck | Same report: portal regularly down, customer-data download disabled, no MNRE replies, and no tracking and verification systems in the portal. About 300,000 grievances received, 274,000 resolved. | Vendor, customer | A1 | Same dating caveat. Mentions a new grievance portal. |
| P4 | Maintenance is mandated, but its scope is unclear | CEEW, June 2026, 60+ vendors across states: the 5-year free maintenance is widely known, but what it includes varies. Cleaning is usually excluded. | Vendor, customer | A1 | Vendor consultations, not a random sample |
| P5 | Service is reactive | CEEW: maintenance mostly follows customer requests rather than schedules | Customer | A1 | As above |
| P6 | "Free" service has a hidden cost | CEEW: most vendors say its cost is built into the install price | Vendor | A1 | No rupee figures from vendors |
| P7 | Customers can't tell who gives support | KPMG 2025: poor alignment between integrator and panel maker on who provides support, with wide variation in ratings | Customer | A1 | Sample size not on the page |
| P8 | Meter delays frustrate customers | KPMG customer quote on a 15-day meter delay. Mongabay reports unconfigured net meters. Rajasthan and Kerala reporting (summaries only). | Customer | A1, A2 | Anecdotal in detail |
| P9 | Repeated paperwork | KPMG customer quote about submitting documents to both integrator and financier | Customer | A1 | One quote |
| P10 | Bills confuse customers | Mongabay, Aug 2025: UP customers billed ₹12,269 and ₹22,295. A metering representative blamed one case on an unconfigured meter. | Customer, support | A2 | Few cases, one region |
| P11 | Output below promises | Mongabay: 5-6 units a day against 13 promised. Officials also cite substandard equipment. | Customer | A2 | Few cases |
| P12 | Hard to judge vendors | WRI, 2018, 1,808 households in five cities: 69% in Chennai and 47% in Bengaluru had trouble verifying trust or price, and under 35% elsewhere | Customer | A1 | Old, before PM Surya Ghar |
| P13 | Installer failure strands customers | SunPower (2024) ended support; customers lost workmanship cover (summaries of Bloomberg Law, SolarReviews and NerdWallet). Sunnova filed in 2025. | Customer | A2 | US. Indian "abandonment" evidence is from sellers only. |
| P14 | Unclear service terms after sale | Vijayawada complaint: ₹3,500 per site visit, and no support period in the quote | Customer | B | One unverified complaint |
| P15 | No stated service time | An inverter seller says warranties promise a "reasonable time" | Customer | C | Seller, and it admits no audited fault rate exists |

## Evidence against our focus

We should keep these in mind instead of pitching around them.

- **After-sales was less often named as the most influential brand-perception stage.** KPMG reports 11% for post-purchase, against 53% for pre-purchase and 36% for purchase. This does not measure fault prevalence, harm severity, installer cost or willingness to pay for software. It challenges a broad customer-acquisition pitch, but neither proves nor disproves the value of an after-sales workflow. Check installer economics separately.
- **Installation itself rates well.** KPMG reports high ratings across delivery and installation.
- **Good practice already exists.** The World Bank report says Tata Power issues a warranty certificate only after an app-based quality check passes, and reports minimal residential complaints. Large players can do this already.
- **Competition is broad.** See `02-products.md`.

## Why are existing products failing?

**We can't show that they are.** We found no Indian solar software shutdown, churn data or switching study. Specifically:

| Claim | Status |
|---|---|
| Installers have failed, and customers were harmed | Documented (US) |
| The government process causes delays | Documented |
| Solar software products are failing | **Not shown** |
| Tools are split by design, sales and operations | Partly true, though SolarBuddy and Solar Ladder claim to span all of them |
| Field staff stop using CRMs | **Hypothesis**, from seller blogs only |
| Per-project pricing puts installers off | **Hypothesis**, from competitors only |

## Rules to design around

Keep all of these configurable and don't state them as current law. We haven't read the final MNRE notice.

| Rule | Status |
|---|---|
| Subsidy for grid-connected residential systems only | Official draft guidelines, via search summary |
| Domestic-content modules required for subsidy | Same |
| ₹30,000, ₹60,000 and ₹78,000 slabs, capped at 3 kW | Worked example in the draft; also in seller guides |
| 5-year free repair and maintenance by vendor | Draft, World Bank and CEEW |
| Subsidy processed within 15 days of DISCOM approval | World Bank |
| 15-day defect proof | **Unconfirmed**, seller guide only |
| Consumer approval of vendor agreement since Sept 2026 | Seller guide only |
| GST on solar | **Sources conflict:** 12% on the goods share in SolarBuddy and a reported 2026 ruling, 5% in reports of Andhra Pradesh High Court decisions. Have a CA check before showing tax as correct. |

## Numbers not to use

I couldn't trace these to a primary source:

- "40% of installers gone by 2023" attributed to JMK Research (I searched JMK's published material and didn't find it).
- "60% of service calls are inverter faults".
- "3-8 weeks to resolve inverter faults".
- Any vendor performance claim, such as "4x faster resolution" or "98% renewal".
