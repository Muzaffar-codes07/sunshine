# Codex cross-review of the expanded research and architecture

31 October 2026. Reviewed `claude-market-research.md` and `claude-architecture.md` only after both independent architecture proposals were posted.

## Market research review

The audit correctly answers the user's original question: the earlier work was incomplete. The expanded files cover the five requested headings, with explicit uncertainty. We should now deliver a bounded desktop-research package, rather than imply either exhaustive market coverage or validated demand.

Required wording corrections:

- A published complaint is user testimony, not an independently confirmed defect. Grade B should say this explicitly. Publication and even platform moderation cannot establish technical root cause.
- Grade A should distinguish original research from journalism and indicate whether the actual page was read. A headline or search summary does not inherit the confidence of a fully inspected original study.
- Solar Ladder makes the comparison more complete, but verify its capabilities from its own page before relying on the competitor review. Price/market-share claims based on one seller should remain optional, dated, and qualified; they are unnecessary to choosing the hackathon problem.
- The strongest additional evidence is the CEEW original multi-state vendor study and KPMG customer research in `codex-evidence-addendum.md`. Include their counterevidence: customer installation satisfaction is often high. Service-support problems do not imply the whole industry is failing.
- Replace a moving weighted score with explicit scenarios: experienced backend team plus permitted stock-code reuse favors Solar; a fresh build or weak backend capacity favors Wedding; experience without reuse remains close. Market evidence supports pain more strongly for Solar, but not exclusive software white space.
- Clarify that no interviews or product trials were performed by us. That is a practical limit, not a claim that published original studies are worthless or that the research deliverable can never be finished without interviews.

## Architecture review: accept with these corrections

The proposals converge on one modular application, a relational database, frozen agreements/kit versions, idempotent commands and auditable money/stock. I support those choices. The proposed architecture is a composition of known patterns; 'new compared with what our sources show' is too strong given we cannot inspect competitors' internals. Call it proposed for these scenarios.

1. **Plan generation key is incorrect.** Claude keys plan generation on deposit and tests 'one plan per deposit'. Two genuine partial booking receipts can then create two full plans. Key it on `(tenant, wedding, generation_purpose)`, record the template revision, and make the first qualifying booking trigger create it once. Receipt idempotency and plan idempotency are separate.
2. **Allocation guard stops too early.** A unique index only on allocated/dispatched status would allow an installed or delivered asset to become allocated again. Use a stable asset UUID, normalized serial uniqueness scoped appropriately to manufacturer/product/tenant, and one active assignment that persists through delivery/installation until explicit return or replacement. Enforce this in the same transaction as stock changes.
3. **Do not require full event sourcing.** An append-only posted ledger is useful for stock and money. For every status and task, replay-only facts add projection/rebuild work. Normal current rows plus immutable material changes and ledger postings are adequate in 24 hours. If a current-asset projection enforces a unique invariant, update it synchronously within the same transaction; a delayed projection cannot guard dispatch.
4. **Offline is not a baseline requirement in the PDFs.** Online mobile evidence capture with local drafts is the MVP. Move reliable offline synchronization out of Must. Never finalize dispatch, payment or coverage decisions on an offline device; show pending versus server-confirmed status. Hashing a sign-off summary alone does not establish identity or prevent evidence tampering.
5. **Avoid unsafe automatic triage.** A high bill may coexist with a physical fault. Ticket type should suggest routing, permit multiple causes and record staff assessment. Do not automatically declare 'not a fault'. Component warranty does not automatically mean supplier reimbursement; exclusions, labor and claim acceptance may differ. Keep 'customer charge', 'internal cost' and 'supplier claim pending/accepted' separate.
6. **QR data boundary.** A QR code cannot hold a full photo-rich handover pack. Put a minimal non-sensitive summary or identifier in it and export the actual self-contained PDF/JSON. Avoid exposing customer identity, address or a public download token in the code. A hosted link does not replace the export.
7. **Money schema needs disbursements.** Cash = receipts minus payments is stated, but the example entry kinds omit vendor payments/refunds/reversals. Include them or derive cash from explicit payment allocations. Do not double-count repair-billed amount if revenue already includes the posted repair invoice.
8. **Client visibility is contractual.** A couple may see agreed service status or pass-through payment evidence under the agency's contract. Do not expose vendor cost or agency margin by default. Role and wedding authorization belong on every server request and file download.

## Suggested final package

Create one five-point audit/index linking both market files, the evidence addendum and the revised architectures. Mark each item as covered at desktop/design level with remaining validation clearly named. Update the selection recommendation to acknowledge partial evidence and avoid serial-scoring churn. The remaining user decision is problem selection and constraints, not authorization to do more ordinary read-only research.
