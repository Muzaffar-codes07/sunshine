# Reporting module

Owner: **D4**. Task 4.1 report engine, Prisma cost/subsidy queries, shared
contracts and Nest routes are implemented. **Production access is integration
gated (503)**; Job, Order, Invoice, Payment and verified staff authorization
are absent on this branch. Pay summaries and CSV remain Task 4.2.

## Routes

- `GET /api/v1/reports/profitability?jobId=<uuid>`: lifetime posted sales and
  service invoices, receipts, outstanding (floored at zero), four cost categories,
  contribution, margin percentage, unfinished steps and completed profit.
- `GET /api/v1/reports/overview?period=today|week|month`: period posted invoice,
  receipt and cost activity. Default is `today`. Week starts Monday.
- `GET /api/v1/reports/subsidies`: milestone buckets with job IDs, pending
  documents and nullable responsible owner. Unassigned owners remain explicit.

Success uses `{ data: ... }`. Query objects are strict: clients cannot override
cutoffs, totals, completion or authorization. Guards run before report reads.
Financial reports require verified ADMIN access (director in the current roles).
No headers or unverified `request.user` fields grant access.

## Definitions

Amounts are exact decimal strings; aggregate fields can exceed the precision of
one ledger row. Signed reversals/refunds reduce their respective totals. Percentages
round half away from zero to two decimal places and are null for nonpositive
invoiced revenue. Contribution = posted invoice value minus actual posted cost;
cash received never creates revenue a second time. Overpayments do not create
negative receivables. A provisional contribution is still visible for unfinished
jobs, while `completedProfit` is `0.00`. Completed results can change when later
repair costs are posted; they are lifetime results as of the server cutoff.

Period windows are half-open IST civil dates converted to UTC, independent of the
host timezone, and additionally exclude events after the server cutoff (`asOf`).
Period activity is not completed-job profit. Lifetime queries have no period
start: historical invoices/costs and current repairs stay attributed to the job.
Only the cost ledger is expensed: ticket totals and raw time/stock rows are not
counted again. Expected subsidy and pending supplier claims are not receipts.

## Integration handoff

1. D2 supplies `ReportingAccess.assertCanReadReports` using verified sessions and
   ADMIN permission, with 401/403 for unauthenticated/unauthorized staff.
2. Supply `ReportingSourceReader.readJob/readPeriod` against real Job/Order,
   Invoice and Payment models. They receive the **same Prisma transaction** as
   cost reads, under Repeatable Read. Resolve sales and repair invoices to the
   correct job, include posted invoices and recorded receipts/refunds, include
   signed reversals once, and exclude drafts, pending claims and customer subsidy.
   Apply independent invoice posting/payment occurrence bounds: lifetime
   `<= asOf`; period `>= start AND < end AND <= asOf`. Read completion/unfinished
   workflow steps in that snapshot. Never multiply financial detail rows via joins.
   Missing jobs return null. Do not implement this interface with fixture data.
3. D3 coordinates the queued D4 migration and upstream FKs. Task 4.1 adds
   `SubsidyMilestone.pendingDocuments` and optional `responsibleOwnerId` (Restrict
   relation to User). These definitions are **not deployed**. Existing PENDING
   maps to report PENDING_DOCS and RECEIVED to DISBURSED. REJECTED has its own
   bucket; no records disappear because they use the existing persisted enum.
   Missing schema maps to `REPORTING_SCHEMA_UNAVAILABLE` (503).
4. Verify real PostgreSQL joins, snapshot consistency, posting/reversal filters
   and migration replay before replacing the unavailable production providers.

Unit and HTTP tests exercise reconciliation, exact cents, bounds, scoped Prisma
queries, envelopes and access gates with injected adapters. They are not real
PostgreSQL acceptance evidence. See the [schema handoff](../../../../docs/architecture/d4-schema-handoff.md)
and [contracts](../../../../docs/architecture/api-contracts.md).
