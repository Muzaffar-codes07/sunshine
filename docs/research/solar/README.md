# Solar market research

Research on existing rooftop solar software, its gaps and what we should design on. Built by Claude on 2026-10-31 and cross-reviewed by Codex. **Architecture comes after this, as Tuhin asked,** so nothing here is an architecture decision.

## The short version

1. **The market is crowded.** SolarBuddy and Solar Ladder, both Indian, already claim most of what the PDF asks for. Odoo has its own solar offering.
2. **We can't show that existing products are failing.** We found no shutdowns, churn data or switching studies for solar software.
3. **The pain is real, but much of it is outside software.** Documented problems include subsidy waits of up to 390 days, unclear maintenance scope and confusion over who gives support. Software can't make a DISCOM act or supply technicians.
4. **No feature gap is proven.** We can only say what didn't appear on public pages.
5. **Our best bets are the difficult moments, not more features:** who pays for this repair and why, what was promised, who is holding this job now, and whether it really made money.

## What's in the folder

| File | What it holds |
|---|---|
| `01-requirements-from-pdf.md` | The 25 baseline requirements, R1 to R25, and how we read the PDF's ambiguities |
| `02-products.md` | Profiles of existing products, and what they mean for us |
| `03-capability-matrix.csv` | Each requirement against 10 products |
| `04-pain-and-evidence.md` | Pain P1 to P15, graded evidence, evidence against our focus, rules, and numbers not to use |
| `05-gaps.md` | Gaps G1 to G10, labelled by how much we actually know |
| `06-solutions.md` | Baseline, ranked bets, what not to build, and pitch wording |
| `07-review-and-validation.md` | Review corrections, matrix source crosswalk, structural checks and remaining validation |
| `sources/source-register.csv` | 45 sources: type, how much we read, what each supports, and limits |
| `sources/raw/` | 22 saved source copies: 3 PDFs of reports, the problem statement and 18 web pages |

## How the files connect

Requirement (R) → pain (P) → gap (G) → solution bet. For example:

R17 and R18 (who pays) + P4 and P7 (unclear scope and support) → G1 (no explained decision shown) → Bet 1 (explained repair decision).

## Reading the capability matrix

| Value | Meaning |
|---|---|
| **Y** | The vendor describes it on its own page. We didn't test it. |
| **P** | Partly described, or close to it |
| **C** | Probably achievable by configuring the platform. Not a ready feature. |
| **3P** | Only a third party says so |
| **?** | **Unknown.** It didn't appear in what we read. **This doesn't mean the product lacks it.** |

There's no "absent" value, because we have almost no evidence of confirmed absence. Many cells are `?` because we read only public pages.

## What this research can't tell you

- **No interviews and no product trials.** Every rival feature is a vendor claim, and whether buyers feel these gaps is untested.
- **Not every product.** This is a researched shortlist.
- **Some sources were only partly read,** and some were read only through search summaries. The register says which.
- **Some pages couldn't be saved.** OpenSolar and Mongabay blocked downloading, and G2, Capterra and TrustRadius review pages couldn't be opened, so user reviews are under-represented.
- **Dated evidence.** The subsidy-delay figures predate March 2025, and the WRI survey is from 2018.

## Still needed from Tuhin or the team

1. May code from earlier projects be reused? Ask the evaluator.
2. Must it be built on Odoo itself?
3. Would someone try a SolarBuddy or Solar Ladder demo, or call two or three installers? Those are the quickest ways to test the gaps.

## Earlier background

[Earlier merged architecture](../history/merged-architecture.md) is a historical draft and hasn't been selected. The original discussion files are preserved in [history](../history/README.md). For implementation use [current architecture](../../architecture/README.md) and [current roles](../../team/roles.md).
