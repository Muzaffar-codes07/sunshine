# Claude's critique of codex-architecture.md

The two designs agree on the main structure: one modular app, one relational database, append-only money and stock, idempotent commands and an outbox. That independent agreement is useful, though it doesn't test the design.

## Codex is better, and I'll adopt these

1. **My deposit rule has a bug.** I keyed plan generation on the deposit, so a second part-payment could create a second plan. Codex's unique `(wedding, generation_purpose)` is right.
2. **Offline shouldn't be a must-have.** I listed an offline field form as required. Codex builds online first and never finalises allocation, billing or warranty decisions offline. That is the right cut for 24 hours.
3. **Serials aren't globally unique.** Codex's `(tenant, manufacturer, product, normalized_serial)` is safer than my unique serial, and it preserves the scanned original.
4. **Unknown is not zero.** A missing quote price stays visibly unresolved, so an incomplete quote can't rank as cheapest. My design only flagged missing lines.
5. **Expiry boundaries are defined exactly:** `start <= date < expiry`, with an explicit stored expiry date.
6. **Idempotency detail:** a reused key with a different request body is rejected.
7. **Outbox only where it's needed,** plain SQL for dashboards, and revision numbers to reject stale run-sheet updates.
8. **Delivery and commissioning stay separate statuses.**

## Where I'd push back or add

1. **Quote as a cost formula, not just rows.** Codex stores units and included quantities but doesn't compare totals at different guest counts. Calculating each caterer at 400 and at 460 is what connects the quote scene to the 60-guest scene, for little extra work.
2. **Repair cost needs a clearer money model.** Codex mentions job-linked cost entries. I'd make it one tagged money table with fixed kinds, so profit, cash and subsidy can't get mixed up.
3. **Service scope must be data.** New from CEEW: what the 5-year maintenance includes varies widely, and cleaning is usually excluded. So coverage needs a scope list as well as dates, and a ticket should be able to answer "not in scope".
4. **The 5-year rule is better supported now.** Two more sources describe it as mandated: the World Bank draft and CEEW. Keep it configurable, but Codex's caution on month-30 billing stands, and I'd show that case in the demo.
5. **Cost of free service.** CEEW says vendors build maintenance into the install price. A job's profit is overstated at handover unless future service is considered. Add a configurable reserve per job as a stretch item, clearly labelled as an estimate.
6. **The handover pack is missing from Codex's data model.** It was agreed in the recommendation, and the KPMG and SunPower evidence supports it. Keep it as a "should".
7. **Pick a stack for the hackathon.** Codex leaves it open. Unless Odoo is mandatory, use the team's known stack, since switching costs time.

## Proposed merge

Use Codex's structure, state transitions and failure probes as the base. Add my cost-formula quotes, tagged money table, handover pack and bill-or-fault triage, plus the service scope and optional reserve above.

`recommendation.md` should drop the invented score table in favour of conditions:

- **Reuse allowed, or the same backend people are available:** Solar.
- **Limited backend capacity:** Wedding.

I'd also add the stronger Solar pain evidence, with the caveat that it doesn't prove a software gap.
