# Independent review: D4 Task 3.1

Copy this prompt into the reviewing agent's thread:

```text
Review D4-plan.md Task 3.1 (Repair Billing & Cost Attribution / S07) in the
Sunshine workspace. Perform a read-only, evidence-based code review. Do not
modify files, commit or push. Follow AGENTS.md and Auric continuity instructions.
Verify saved context against Git/files; other Task 4.2 work may be concurrent.

Read README.md, docs/team/roles.md, docs/TRD.md sections 4–7 and 12,
docs/architecture/{api-contracts,data-model,d4-schema-handoff}.md,
and apps/api/src/{service,finance}/README.md before assessing requirements.

Task 3.1 implementation scope:
- apps/api/src/service/repair-billing.service.ts
- apps/api/src/service/repair-billing.types.ts
- apps/api/src/finance/service-invoice-writer.ts
- apps/api/src/{service/service,finance/finance}.module.ts
- apps/api/test/repair-billing.test.cjs
- prisma/schema.prisma: ServiceTicket.billingSnapshot only
- Corresponding service/finance READMEs and architecture documentation.
Use git diff and inspect complete files. Existing uncommitted reporting/pay/CSV
changes and local .gitignore/.cursor/AGENTS.md edits are outside this review.
Inspect existing CostWriterService, ticket lifecycle/repository and warranty
snapshot contracts where needed to detect cross-module problems.

Check these concrete risks:
1. Covered repairs post actual parts AND labour costs to the original job,
   create no customer invoice and no extra outstanding receivable. Reconcile
   the real report engine: 55000 revenue - 40000 material - 2400 installation
   - 14000 repair parts - 600 service labour = -2000 contribution, outstanding 0
   when 55000 has been paid. No supplier claim/payment counted as revenue.
2. Every uncovered outcome uses D2's official invoice boundary exactly once
   with correct customer/job and distinct selling prices, not internal costs.
   Validate invoice source TICKET:<ticketId>:REPAIR, pre-tax subtotal semantics,
   separate tax ownership, and zero-price uncovered work. No direct invoice writes.
3. Money uses exact quantity-millis × rate-cents, half-up per line, then sums.
   Probe 0.005 × 1.00 = 0.01, 0.005 × 3.00 = 0.02, zero rates, decimal limits,
   individual/batch overflow and malformed runtime facts. No JS float drift.
4. Source inputs cannot override amounts, billability, coverage or linkage.
   Trusted source facts must agree with ticket/job/customer and saved actual
   scope. Component cover must not silently cover unrelated labour. Probe
   missing/duplicate/malformed sources, cross-ticket reuse and unapproved time.
   Identify which checks the persisted source adapter must enforce.
5. Parts must reuse D3's consumed STOCK_MOVEMENT:<id>/REPAIR_PARTS posting;
   service labour uses TIME_ENTRY:<id>/SERVICE_LABOUR. Existing cost-writer
   first-write-wins behavior must not silently accept a different job/amount.
   No ticket total or alternate cost-type posting should double expenses.
6. Same transaction covers source effects, costs, invoice, ticket lines and
   billing snapshot. Every failure must reach the outer transaction so it rolls
   back, including late failures. Status/version CAS must serialize billing
   with lifecycle actions; check lost CAS, concurrent bills and conflict retries.
   Do not claim transaction doubles prove PostgreSQL isolation/rollback.
7. Canonical reference hash/result prevents changed-source rebilling and
   duplicate lines/invoices/costs. Reorder/UUID-case retries and post-closure
   replay return original frozen rates/results. Check malformed saved snapshots,
   and whether mutable source facts or changed commands can undermine replay.
   Internal business-source replay is separate from outer actor/key/payload
   command records; confirm no unauthenticated HTTP command was introduced.
8. Nest wiring/export, structured errors and migration handoff must be sound.
   Upstream Unit/Job, consumed-stock/time, auth, invoice helper and the coordinated
   D4 migration are absent on this branch. Default adapters intentionally return
   503 and no billing route is added. Record these as integration blockers;
   distinguish them from defects in the implemented helper. Confirm no success
   is fabricated or unguarded route added to bypass these dependencies.

Run npm.cmd run check and git diff --check. For focused reproduction run
npm.cmd run db:generate, npm.cmd run build -w @sunshine/contracts,
npm.cmd run build -w @sunshine/api, then
node --test apps/api/test/repair-billing.test.cjs.
Inspect test assertions rather than treating green output as proof. Seek missing
adversarial cases and reproduce suspected bugs with a minimal example if possible.
Do not reset or edit other work. Do not apply migrations to bypass D3's gate.

Return findings first, sorted by severity. For EACH actionable defect give:
- Priority and exact file:line location.
- Concrete trigger/input or interleaving, observed behavior and expected result.
- Why it breaks Task 3.1 or existing contracts, with supporting code evidence.
- The smallest specific code change needed and a regression test to add.
Avoid speculative findings, broad refactors and style-only complaints. If no
defects are found, say so explicitly. Separately list real integration blockers,
test limitations, commands/results, and readiness for review vs production.
```
