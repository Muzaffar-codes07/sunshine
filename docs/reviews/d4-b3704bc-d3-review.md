# D3 review of the D4 migration and integration handoff

Reviewed PR: [#8](https://github.com/Muzaffar-codes07/sunshine/pull/8), pinned head `b3704bc71e596ffd49bde812f1781273248c019f`. Current-main baseline: `4ce0ab866b9e1915f674f3fb4d8a0d50ad4a249e`. This review uses Sunshine sources only and does not change D4's branch or approve/perform its merge.

## Conclusion and scope

The exact D4 migration and transaction-aware cost writer pass the focused PostgreSQL review below. The earlier cost-source mismatch and occurrence-time findings are fixed at this head. The migration adds actual restrictive Unit/Job/File relationships and an immutable cost ledger with linked full reversals. No placeholder allocation/ticket source is enabled.

Before landing #8, its owner must integrate current main and preserve the installation evidence schema and rule registry. Three files currently conflict: `prisma/schema.prisma`, `prisma/required-constraints.json`, and `docs/architecture/schema-conventions.md`. An isolated local trial merge resolves them without editing D4 SQL or the cost writer. The combined runtime verification is recorded below separately from the pinned-branch checks. Its SQL and cost-writer source are byte-identical to the pinned PR; only the three merge conflicts were resolved in the isolated review branch.

This is migration/cost integration evidence, not approval of complete warranty/service/replacement/reporting behavior. Production adapters and delivery activation remain separate acceptance gates. Bhanu owns #8 and its merge.

## Executed checks

Environment: Node22.23.3, PostgreSQL17.11, isolated test databases on the review container. No application/demo database was migrated or reset.

| Candidate | Checks | Result |
|---|---|---|
| Exact `b3704bc` | Fresh19 migrations, Prisma generation, contracts/API builds | Pass |
| Exact `b3704bc` | Existing9 real D4 database tests: actual FKs, source races/replays/conflicts, caller rollback, full reversals, immutable/nonfinite guards, period cutoff, warranty/closure checks, late-prerequisite migration atomicity | 9/9 pass |
| Exact `b3704bc` | Root required-rule checker; checker mutation scenarios; Prisma schema diff | 165 rules;26 scenarios;no drift |
| Exact `b3704bc` | Independent reviewer probes in [d4-b3704bc.mjs](probes/d4-b3704bc.mjs) | 23/23 pass:22 behavior checks and1 schema-gap observation |
| Populated current-main database copy | Apply exact D4 SQL after installation evidence; compare existing row counts | Pass; unchanged counts below |
| Local trial integration `aa6b0cf` | Fresh20 migrations and combined runtime checks | Pass:full check;229/229 API database tests;9/9 D4 database tests;184 canonical rules;empty drift;both smoke scenarios;exit0 |

Independent probes verify changed source description/time rolls back preceding caller writes; a downstream error removes the new cost; zero-cost reversals race/replay correctly; ordinary negative costs and reserved reversal sources are rejected; NaN/blank values and orphan cost jobs fail; wrong-amount/early reversals fail; invalid warranty dates/durations/policies and part quantities/costs/totals fail; exact `0.333 × 1.50` rounds to `0.50`; all12 D4 FKs are validated and restrictive.

The first reviewer-probe run stopped because a NaN quantity test also supplied a NaN total, triggering the cost CHECK first. The probe now supplies a finite total to isolate the quantity CHECK. This was a test expectation correction; no product SQL was changed. The corrected full probe run passes.

The upgrade uses a disposable copy of the populated S03 integration test database, applies the exact `20261031260000_d4/migration.sql`, and commits only there. Before/after counts:

| Existing table | Before | After |
|---|---:|---:|
| jobs |111|111|
| allocations |591|591|
| stock_movements |624|624|
| files |73|73|
| job_photos |14|14|
| installation_time_records |16|16|

The combined full check includes89 contract tests plus API unit/service tests, seed tests and invariant scenarios. The executable probe stored with this report was also rerun successfully after its local-target guard and portable checkout path were added.

The copy already had installation migration280000 applied; D4's earlier reserved260000 SQL still applies additively. This direct-SQL probe proves database compatibility/data-count preservation, not a production migration rehearsal or Prisma migration-history recording.

## Exact merge resolution

- Prisma `Job`: retain D4's `costs`, `serviceTickets`, `subsidyMilestones` reverse relations **and** main's started/completed actors, signature, photos and time records.
- Prisma `File`: retain `subsidyEvidenceMilestones` **and** main's `signedJob`/`jobPhoto` relations.
- Required-rule registry: union by `(table,kind,name)`, assert common entries are identical; retain every installation, scan, stock, sales and D4 definition. Never resolve by replacing main's registry with the PR version.
- Schema conventions: preserve installation slot280000 and D4's260000. D3 scans remain270000; Files255000/release250000 remain unchanged.
- Preserve #49's Job-before-File attachment fix and current frontend. No applied migration needs rewriting for these merges.

## D3 allocation follow-up plan

Adding only `allocations.ticketLineId` would be unsafe. At the reviewed head `TicketLine` stores quantity/cost/billability but no canonical Product FK; the current `reserveTicketPartsRequestSchema` names a ticketLineId without a product override. There is no persisted authority from which the allocator can derive the requested part product. This is a verified integration gap, not a reason to invent a product or trust a client SKU.

The proposed integration contract below must be coordinated with the D4 owner before enabling repair stock. It is not represented as an implemented adapter or a new approved task.

1. D4 creates the actual PART requirement before D3 reservation. Persist the required Product identity and quantity (for example a nullable `TicketLine.productId` Product FK, required for PART and null for LABOUR). Historical rows need an explicit migration policy; do not fabricate products. Decide who creates this requirement before implementing the consumer.
2. D3 follows the actual D4 schema with a new migration after the latest main slot: add nullable `Allocation.ticketLineId`, restrictive FK and exactly-one-of quoteLineId/ticketLineId CHECK; retain the one-active-allocation-per-unit rule. Do not edit the existing quote-source migration.
3. Source validation branches by actual source: quote requirements retain today's behavior; repair requirements must be PART, unresolved/eligible, and match ticket → job → order → customer plus persisted product/quantity. Reject LABOUR, wrong job/customer/product, over-reservation and already billed/closed sources. The source-read trigger and application writer must change together.
4. Define lock order in the actual caller chain before coding: D4 replacement/billing currently claims Ticket; D3 must preserve its Product → stock-key → sorted Unit order and document where Job and source line fit. Test reverse-order two-connection scenarios, not just sequential helper mocks.
5. Allocation is a hold only. At actual consumption, use the single stock-ledger writer, freeze actual unit acquisition/bulk cost basis, and call D4 `CostWriterService.postCost(tx, ...)` with `STOCK_MOVEMENT:<canonical movement UUID>` and `REPAIR_PARTS`. Retain source occurrence time and exact description for replay. Do not post estimated line totals as another expense.
6. Reuse the PART ticket line in billing, as D4's current helper requires. Its frozen quantity/cost/billability must match the actual allocation/consumption facts; the helper must not insert a second PART line. A line with several consumption sources currently conflicts with D4's one-distinct-line-per-source assumption; keep a single-source rule or jointly revise that contract before allowing splits.
7. Add Unit predecessor history and actual replacement/return primitives only with their lineage, stock, returnable-quantity and cost-reversal tests. A nullable self-FK alone does not implement replacement. New-sale warranty activation must not reset replacement coverage.

Acceptance: real paid installation source and assessed repair ticket; same-unit allocation race has one winner; every shortage/error rolls back all effects; retries preserve allocation/movement/cost/line IDs; invalid source/part/customer refused; old unit quarantined and new unit/customer traceable; stock quantities and exact cost sources reconcile after successful replacement and reversal.

## Other dependencies that stay open

- Dispatch I06 can consume the real single cost writer after #8 lands; it must still post stock/cost and state changes atomically with scan rechecks.
- Delivery I07 needs D4's agreed `activateFromDelivery(tx, delivery)` ownership/interface. No activation helper is provided by this review.
- S04 needs a persisted rate source and the single writer; stored time records are not already-posted labour costs.
- Warranty equipment, repair sources, replacement stock, service invoices and ticket-file authorization remain gated by their actual providers. Read-only foundation approval does not authorize an unavailable adapter to return synthetic success.

## Reproduction

Check out the pinned PR in an isolated worktree, supply a disposable local `TEST_DATABASE_URL`/`DATABASE_URL`, and run Node22:

```sh
npm run db:deploy
npm run db:generate
npm run build -w @sunshine/contracts
npm run build -w @sunshine/api
npm run test:d4-migration
npm run db:check
npm run test:constraints
```

Then run this report's probe from a checkout containing it, using the compiled reviewed checkout as `D4_REVIEW_ROOT`. The D4 database test above supplies the actual fixture jobs/unit/ticket. Probes append cost fixtures only in the explicitly selected disposable database; individual SQL refusal cases roll back.

```sh
D4_REVIEW_ROOT=/absolute/path/to/reviewed-d4-checkout \
TEST_DATABASE_URL=postgresql://review:password@127.0.0.1:55441/disposable_test \
node docs/reviews/probes/d4-b3704bc.mjs
```
