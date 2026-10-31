# Independent review: D4 Task 3.2

Copy this prompt into the reviewing agent's thread:

```text
Review D4-plan.md Task 3.2 (Hardware Replacement Lineage & Warranty Continuity,
backlog S08) in the Sunshine workspace. Perform a read-only, evidence-based
review. Do not modify files, commit or push. Follow AGENTS.md, including Auric
continuity. Verify saved context against current Git/files. Local .gitignore,
.cursor/ and AGENTS.md changes are unrelated; preserve them.

Read README.md, docs/team/roles.md, docs/TRD.md sections 4-7 and 12,
docs/requirements/product-requirements.md R17, backlog S08 and I08,
docs/architecture/{data-model,d4-schema-handoff,api-contracts}.md, and
apps/api/src/service/README.md. The primary task guide says ALLOCATED for the
new unit while its embedded prompt says deployed; this implementation explicitly
uses ALLOCATED. Check the documented actual-issue/consumption boundary carefully.

Implementation scope (inspect git diff plus complete new/untracked files):
- apps/api/src/service/replacement.service.ts
- apps/api/src/service/replacement.types.ts
- apps/api/src/service/repair-billing.service.ts and repair-billing.types.ts
  (trusted allocation ticketLineId validation/reuse)
- apps/api/src/service/service.module.ts
- apps/api/src/service/service.service.ts (lineage response mapping only)
- packages/contracts/src/service.ts (nullable old/new lineage IDs)
- prisma/schema.prisma (ServiceTicket replacedUnitId/newUnitId/replacementSnapshot
  and their indexes only)
- apps/api/test/replacement.test.cjs
- apps/api/test/repair-billing.test.cjs (allocation-line validation/reuse regression)
- apps/api/test/service.test.cjs (lineage retention regression)
- Corresponding service README, architecture docs and local D4-plan status.
Task 3.1 is already committed at 61a2bc3; inspect existing repair-billing service,
source/invoice ports, cost writer, ticket CAS repository, warranty engine and
contracts to identify interaction bugs, without reviewing unrelated history.

Check these risks with concrete inputs or interleavings:
1. Same supplied Prisma transaction reaches D3's stock helper, warranty writes,
   Task 3.1 billing, D2 invoice/cost helpers and ticket lineage/snapshot. Any
   exception must propagate so the outer caller aborts all effects. Probe late
   invoice and final snapshot failure; no nested independent commit or catch-and-
   commit path. Doubles do not prove real PostgreSQL rollback or isolation.
2. Defective unit matches the assessed ticket/unit/job/customer and old serial.
   Old becomes QUARANTINE; new becomes ALLOCATED with correct predecessor and
   installation. D3 must lock/recheck availability, compatibility, allocation
   ownership, immutable movements and one-active-assignment constraints. Identify
   which checks are enforced here and which require the persisted adapter.
   Source references must correspond to the actual replacement unit/part line;
   another source must not satisfy the replacement cost accidentally.
   The stock adapter creates/references the allocation's PART TicketLine before
   billing. The persisted PART source must return that exact ticketLineId (never
   a client override). Verify billing validates and reuses it, preserving the
   allocation reference; only LABOUR inserts a new line. Reproduce 14000 parts +
   600 labour: two persisted lines totaling14600, not three totaling28600. Probe
   missing/wrong-ticket/wrong-type lines, quantity/cost/billability mismatches,
   duplicate source-to-line mappings and PART-only batches. Replay must retain
   line counts/IDs; legacy result snapshots without the new ID must still replay.
3. New warranty copies original startDate AND exclusive expiryDate, policyName,
   policyRevision, scope, durationMonths and active exactly. An inverter swapped
   2025-07-01 on a 2024-01-01..2026-01-01 policy has six months left, never 24.
   Probe leap-day/long-policy dates, expired and void policies, original policy
   edits, date-only encodings and new-unit preexisting coverage. No blind upsert,
   void revival or later new-sale activation may extend coverage. No original
   warranty requires an explicit policy decision, not a fabricated default.
4. Stock consumption occurs before billing, uses canonical STOCK_MOVEMENT:id /
   REPAIR_PARTS cost and actual frozen rates; no replacement-total expense doubles
   it. Real Task 3.1 uses saved scope/coverage, original job/customer and D2 invoice
   boundary. Covered replacement has zero customer charge/no invoice; uncovered
   work bills once. Already finalized billing must reject a new swap so the new
   stock source cannot escape final billing. Check actual-issue vs reservation
   semantics and what D3 must supply before this adapter can be enabled.
5. Ticket status/version CAS serializes replacement with billing, resolve and
   confirm; warranty version CAS protects policy copying. Probe two tickets
   claiming one new unit, two swaps for one old unit, two callers on one ticket,
   destination warranty uniqueness, stale policies, version limits and failures
   after locks. Distinguish local guarantees from required D3 locks/constraints
   and bounded outer transaction retries. Missing tables/columns must fail
   honestly, without hiding unrelated errors.
6. Canonical UUID case/equivalent timestamp offsets replay the original frozen
   result, including after closure, with no new stock/cost/invoice/warranty effects.
   Different old/new IDs or assessment instant conflict. Probe malformed saved
   snapshots and mismatched ticket/result lineage. Original ticket.unitId stays
   immutable; old/new serials remain traceable through helper result, snapshot,
   Unit predecessor history and public ticket IDs. Subsequent swaps use a new
   ticket for the installed replacement. Existing resolve/confirm must retain
   lineage and still require customer confirmation.
7. Strict inputs reject self-swap, malformed UUID/offsetless/future assessment
   instant and extra price/coverage/date/owner overrides before mutation. Saved
   assessment must match the unit and IST date, including the previous UTC day
   at 18:30Z. Component cover must not silently cover unrelated work. Inspect
   invalid adapter results and malformed original warranty facts.
8. Nest provider/export wiring and response contracts must work. No public
   unauthenticated replacement route or placeholder upstream table is introduced.
   The D3 stock port intentionally returns 503; existing staff/source/invoice
   adapters and coordinated migration are still absent. Schema handoff must list
   Unit Restrict FKs for both lineage IDs, predecessor history, paired/null
   lineage checks, different old/new IDs and original unit equality, allocation
   uniqueness, migration replay and real PostgreSQL acceptance. Record these as
   integration blockers separately from defects in the implemented helper.

Run npm.cmd run check and git diff --check. For focused reproduction:
npm.cmd run db:generate
npm.cmd run build -w @sunshine/contracts
npm.cmd run build -w @sunshine/api
node --test apps/api/test/replacement.test.cjs apps/api/test/repair-billing.test.cjs apps/api/test/service.test.cjs
Inspect assertions and seek missing adversarial cases. Reproduce suspected bugs
with the smallest example. Do not apply migrations or reset other work. If a
command fails due to environment permissions, report the command and exact cause
separately from code defects; do not infer tests passed.

Return actionable findings first, sorted by severity. For EACH defect give:
- Priority and exact file:line location.
- Concrete input/interleaving, observed behavior and expected behavior.
- Evidence showing why this violates Task 3.2 or an existing invariant.
- Smallest specific code change needed and regression test to add.
Avoid speculative findings, style complaints and unrelated refactors. If no
defects are found, say so explicitly. Separately list real integration blockers,
test limitations, commands/results and readiness for review versus production.
```
