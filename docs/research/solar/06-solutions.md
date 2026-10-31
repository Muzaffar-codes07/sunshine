# Solutions to design on

These are hypotheses for our design, not exclusive features. Rivals may already do some of them well. Architecture comes after this. Effort is my estimate.

## Priority 1: the PDF baseline

R1 to R25 in `01-requirements-from-pdf.md` come first. The brief asks for six scenes; the actual judging rubric hasn't been verified. Every differentiator below depends on the baseline. Demonstrate **rules that are really enforced** (G8), without claiming rivals fail to enforce them:

- A quote is refused before survey approval.
- A serial can't be dispatched twice.
- A retried delivery doesn't move the warranty date.
- A ticket can't close until the customer confirms.

R23 includes a technician-pay summary from recorded hours. Keep that in the baseline; full payroll is beyond this scope.

## Priority 2: our bets, in order

| Rank | Bet | Closes | Who benefits, and how | What software can't fix | How to check the benefit | Effort |
|---|---|---:|---|---|---|---|
| **1** | **Explained repair decision.** Ticket shows customer charge, internal cost, supplier claim, the rule used and the dates, saved for later. | G1, G3 | Support staff give one defensible answer. Owner avoids free work given by mistake and disputes. | Whether a supplier actually pays a claim, and missing technicians | Give staff real past cases, and see if they reach the same answer | Low to medium |
| **2** | **Service scope on every job.** What's included and excluded (for example, cleaning), shown on the quote, handover and ticket. | G2 | Customer knows what's covered. Support can say "not in scope" with evidence. | The scope itself is a business decision | Count disputes about what was promised | Low |
| **3** | **Who's holding it now.** A single queue of everything unfinished, each with one owner: us, the customer or DISCOM, plus days waiting. Shareable timeline for the customer. | G4 | Director sees what's unfinished. Staff can show a blaming customer where a subsidy sits. | **It can't make a DISCOM or portal move** | Time to identify the owner, and fewer "where's my subsidy" calls | Medium |
| **4** | **True job profit.** Repairs go back to the original job, with profit, cash and subsidy kept apart. | G5 | Director answers "which installations really made money?" over time. | Accuracy depends on hours and costs being entered | Reconcile one finished job plus one covered repair by hand | Medium |
| **5** | **Customer-held handover pack.** Self-contained PDF or JSON with serials, warranty dates, scope, photos and acceptance. | G6 | Customer keeps records, and another service provider can use them. | It doesn't guarantee repairs if the company closes | Can someone find the right proof from the file alone? | Low |

**Why this order:** bets 1 and 2 have the best documented support (CEEW, KPMG) and make the strongest demo moment, a repair decision that explains itself. Bet 3 answers the World Bank evidence and the director's "what's unfinished?" question. Bets 4 and 5 are useful but have weaker evidence.

## Priority 3: only if time remains

| Idea | Closes | Note |
|---|---|---|
| Bill-or-fault routing on tickets | G7 | Suggest a route, and staff decide. A high bill can coexist with a fault, so it must never auto-close. |
| Planned service reserve per job | G5 | CEEW says free service is priced in. Must be labelled an estimate. |
| Scheduled maintenance reminders | P5 | Rivals already have this |

## What we shouldn't build

| Idea | Why not |
|---|---|
| Roof design or simulation | Aurora, Arka360 and OpenSolar are far ahead, and the PDF doesn't ask for it |
| Live government or DISCOM integration | Not asked for, and we didn't check whether an API exists. A tracked checklist meets R22. |
| Automatic WhatsApp messaging | Rivals are ahead. Not worth 24-hour time. |
| AI chatbot or AI fault diagnosis | The PDF doesn't ask for it, and it would distract from the rules |
| Maintenance marketplace | CEEW discusses it, but it's a different business |
| Hardcoded subsidy, GST or scheme rules | Sources conflict or are dated, so keep them configurable |

## The pitch

**Don't say:** "first unified platform", "competitors lack this", "existing products are failing", "industry-first", or any uncited statistic.

**Do say, as our position:** "Solar software already tracks jobs and warranties. We focused on making the difficult moments defensible: who pays for this repair and why, what was promised, who is holding this job now, and whether this job really made money."

**One evidence line to use:** CEEW's June 2026 study of 60+ vendors found that the scope of free maintenance varies widely, and a World Bank draft from March 2025 cites an audit note of subsidy waits of up to 390 days. Both sources support the problem, not a claim about any product.
