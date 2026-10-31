# Solar or Wedding: merged recommendation

Merged by Claude from `claude-research.md`, `codex-research.md` and both critiques; reviewed by Codex. Status: joint research recommendation, awaiting the team leader's selection. No implementation is approved by this document.

## Recommendation

**Choose Solar, with moderate confidence.**

The reason is the team, not an empty market. Both markets are crowded, and Odoo publishes an official industry solution for each. Claude's review of StockSense repository history reports a stock-ledger implementation produced in about seven hours. That is evidence of relevant experience, rather than verification of production correctness. If the same backend skills are available this weekend, Solar offers a strong engineering story and a clear demo.

**Choose Wedding instead if** the people building this weekend have little backend capacity, or the team can't show a stock movement and a serial-to-customer history early in the build. Wedding is the safer delivery and the easier demo to understand.

## What decides it

We've dropped the earlier numeric scores. They were judgement with invented weights, and they kept moving with each new source.

| Situation | Choice |
|---|---|
| Same backend people, and StockSense code may be reused | Solar |
| Same backend people, but no code reuse | Close. We lean Solar for the team's ledger experience. |
| Fresh build, or limited backend capacity | Wedding |

**Market evidence:** public evidence of real pain is stronger for Solar, including World Bank, CEEW and KPMG sources in India. That is not proof of an unserved software gap, because Solar Ladder, SolarBuddy, Odoo and others already claim much of this. Wedding has thinner India evidence, partly because we found no planner interviews, which doesn't mean the pain is smaller.

**StockSense evidence:** the repo shows 53 commits between 09:17 and 16:15 IST on 26 Sept 2026, from 4 contributors: 29 Muzaffar-codes07, 14 Tuhin-void, 5 Eupho, 5 VBTG. It has auth, RBAC, warehouses and an append-only stock ledger. It has no serial or warranty model, so that part is new either way. Confirm the same people are building this weekend.

## Are existing products failing?

**We found no evidence that the software products themselves are failing.** No paid product was tested and no customer was interviewed. What the sources do show:

- **Solar:** tools tend to specialise in design, sales or operations. SolarBuddy claims Indian serial scanning and warranty lookup, Zoho FSM documents warranty-aware service, and Odoo has a solar suite. Real company failures are installers such as SunPower and Sunnova, whose customers lost support. Those are US cases and don't prove an Indian software gap.
- **Wedding:** distinguish marketplaces such as WedMeGood from agency operations suites. Aisle Planner and Odoo already cover substantial planning workflows; India-built CRMs such as Plan A Wedding also claim purchase orders, payment milestones and GST. We did not independently verify competitor claims that overseas suites lack particular local features.
- **Do not pitch** "first unified platform" or "competitors lack this" for either.

## Coverage of Tuhin's five points

Public research and design are covered for both problems. We did no interviews or product trials.

| Point | Status | Where | Still unvalidated |
|---|---|---|---|
| 1. Products out there | Covered at desk level | `claude-market-research.md`, `codex-research.md` | Features are vendor claims, not tested |
| 2. Gaps | Partly covered | `claude-market-research.md` | Whether buyers actually feel these gaps |
| 3. Solutions | Proposed | `claude-market-research.md`, `merged-architecture.md` | Benefits are hypotheses |
| 4. Why products fail, and the pain | Partly covered | `claude-market-research.md`, `codex-evidence-addendum.md` | Pain is documented. General product failure isn't shown, and root causes are unknown. |
| 5. Architectures | Designed for both | `merged-architecture.md` | Not built or tested |

## What to build for Solar

The design is in `merged-architecture.md`.

**One persistent demo case:** qualified enquiry → approved survey → 3 kW quote and kit → recorded advance → unique serial dispatch → customer sign-off → month-18 covered fault → owner dashboard.

**Build these first, because the PDF requires them:** survey gate before quote, kit expansion into parts, packing list and crew schedule on confirmation, serial scan with typed fallback, warranty clocks starting on delivery, phone form with photos and signature, tickets that are free or billed by coverage, job profit, and CSV export.

**Add these only once the baseline works:**

| Addition | Why it earns its place | Limit |
|---|---|---|
| Portable customer handover card | Records stay with the customer | Self-contained PDF or JSON. Doesn't guarantee repairs. |
| Subsidy next-owner checklist | Shows whether the customer, vendor or DISCOM must act next | Checklist only, no portal integration |
| Separate component and service coverage fields | A repair can be free to the customer yet still cost the company | Configurable, not hardcoded |
| Repair cost on the original job's profit | Shows true job margin | Keep profit, cash and subsidy separate |

**Dropped from the committed build:** hardcoded subsidy amounts, the 15-day defect deadline, and a mandatory 5-year free-service rule.

## Scheme rules: what we checked

| Rule | Status |
|---|---|
| Subsidy only for grid-connected residential systems | In the [official draft guidelines](https://solarrooftop.pmsuryaghar.gov.in/notification/172_notification.pdf), seen via search summary |
| Domestic-content modules required for subsidy | Same draft |
| 5-year free repair and maintenance by the vendor | Same draft. Also described as mandated in the [World Bank draft, March 2025](https://documents1.worldbank.org/curated/en/099032925033036806/pdf/P508489-0fa8a91c-4052-4cce-b4da-ce6d805cf5c6.pdf) and [CEEW, June 2026](https://www.ceew.in/sites/default/files/ceew-oandm-ecosystem-for-rts-web-ready-file.pdf). CEEW says its scope varies widely. |
| ₹78,000 at 3 kW | Same draft, as a worked example |
| Subsidy processed within 15 days of DISCOM approval | World Bank draft, which also cites waits of up to 390 days |
| 15-day defect proof | Not confirmed in official text; seller guide only |

The guideline draft is from early 2024 and we did not read the final notice. Keep these values configurable, and don't state them as current law in the pitch.

## Must be true before the build is called done

- A job can't be quoted before its survey is approved.
- A serial can't be allocated twice, including after delivery, and a retry doesn't repeat a stock movement.
- Warranty status is correct on the boundary dates.
- Repair cost lands on the right job.
- Dashboard totals match the job details.

The demo must show its date override openly. "SunPower Solutions" in the PDF is fictional, so don't link it to the real SunPower.

## Questions for Tuhin and the leader

1. Which problem does the leader select?
2. May StockSense code be reused? Ask the evaluator; we found no rule.
3. Must it be built on Odoo? The PDFs say only "one unified software platform", and the rubric wasn't found.
4. Are the same four people building, and who has backend capacity?

## Sources

Full source lists are in `claude-research.md` and `codex-research.md`. The ones that changed the outcome:

- [SolarBuddy inventory](https://www.solarbuddy.in/solar-inventory-software)
- [Odoo Solar](https://www.odoo.com/industries/solar-energy)
- [Odoo Wedding Planner](https://www.odoo.com/industries/wedding-planner)
- [Zoho FSM assets](https://www.zoho.com/fsm/assets.html)
- [Codingclave India wedding comparison](https://codingclave.com/guides/best-wedding-planner-software-india-2026) (seller)
- [PM Surya Ghar draft guidelines](https://solarrooftop.pmsuryaghar.gov.in/notification/172_notification.pdf)
