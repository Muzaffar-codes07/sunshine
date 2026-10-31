# Reporting module

Owner: **D4**. Task 4.1 report engine, Prisma cost/subsidy queries, shared
contracts and Nest routes are implemented. **Production access is integration
gated (503)**; Job, Order, Invoice, Payment and verified staff authorization
are absent on this branch. Task 4.2 pay calculations, typed CSV export and guarded
download routes are also implemented; persisted TimeEntry reads remain unavailable.

## Routes

- `GET /api/v1/reports/profitability?jobId=<uuid>`: lifetime posted sales and
  service invoices, receipts, outstanding (floored at zero), four cost categories,
  contribution, margin percentage, unfinished steps and completed profit.
- `GET /api/v1/reports/overview?period=today|week|month`: period posted invoice,
  receipt and cost activity. Default is `today`. Week starts Monday.
- `GET /api/v1/reports/subsidies`: milestone buckets with job IDs, pending
  documents and nullable responsible owner. Unassigned owners remain explicit.
- `GET /api/v1/reports/pay-summary?period=today|week|month`: approved installation
  and service hours and frozen-rate pay, grouped by technician with grand totals.
  Default period is today; response includes the same IST window/server cutoff.
- `GET /api/v1/reports/export.csv?report=overview&period=month`: streamed UTF-8
  CSV attachment. `report=pay` uses the same period options; `report=profitability`
  requires `jobId=<uuid>` and exports lifetime figures for that job. Period defaults
  to today for overview/pay. `export-csv` is a compatibility alias. A report selector
  is required; unknown/duplicate/mixed filters are rejected before reads.

Success uses `{ data: ... }`. Query objects are strict: clients cannot override
cutoffs, totals, completion or authorization. Guards run before report reads.
Financial reports require verified ADMIN access (director in the current roles).
No headers or unverified `request.user` fields grant access.
CSV responses use `text/csv; charset=utf-8`, a fixed attachment filename,
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Pay JSON is also
not cached. Failed reads retain the standard JSON error envelope before streaming.

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
Cost period membership uses the source's `occurredAt`, while `postedAt <= asOf`
limits the ledger to facts recorded by that cutoff. Lifetime costs require both
occurrence and posting `<= asOf`. A late posting therefore belongs to its earlier
occurrence period when queried after posting, rather than the posting period.
Period activity is not completed-job profit. Lifetime queries have no period
start: historical invoices/costs and current repairs stay attributed to the job.
Only the cost ledger is expensed: ticket totals and raw time/stock rows are not
counted again. Expected subsidy and pending supplier claims are not receipts.

Pay uses positive decimal hours (up to three places) and a nonnegative frozen
hourly rate (up to two places) from each approved time entry. Work occurrence is
in `[start, end)` and `<= asOf`; approval must be present, ordered after work and
`<= asOf`. Integer milli-hours times rate cents are rounded **half-up per entry**
to cents, then summed. A technician's current rate never reprices history. Aggregate
hours/pay exceed single-row precision safely. Duplicate IDs, inconsistent technician
names and malformed records return `INVALID_REPORT_RECORD` (503). Pending/rejected
entries and out-of-window/future work or approvals contribute nothing. Empty
periods return an empty technician list and zero totals. This read-only pay summary
does not post payroll, payments, invoices or additional ledger costs.

CSV uses fixed headers, quoted/escaped cells, CRLF records and a final CRLF.
Text with formula triggers (`=`, `+`, `-`, `@`), including behind leading whitespace
or controls, or leading tabs/returns/newlines, receives an apostrophe prefix.
Only explicitly typed decimal numeric cells bypass text protection; a name like
`-1500.00` stays protected text while a financial loss stays numeric. Default
exports omit phones/addresses. Profitability exports preserve provisional status,
unfinished steps and separate lifetime revenue, cash, costs and profit. Empty pay
CSV is headers only. CSV content is assembled in memory before streaming; this is
appropriate for current demo scope, not an unbounded bulk-export implementation.

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
3. The coordinated D4 migration and real upstream FKs are now in the PR queue. Task 4.1 adds
   `SubsidyMilestone.pendingDocuments` and optional `responsibleOwnerId` (Restrict
   relation to User). They have been replayed only on disposable test databases;
   deploy the reviewed queue explicitly in the target environment. Existing PENDING
   maps to report PENDING_DOCS and RECEIVED to DISBURSED. REJECTED has its own
   bucket; no records disappear because they use the existing persisted enum.
   Missing schema maps to `REPORTING_SCHEMA_UNAVAILABLE` (503).
4. Verify real PostgreSQL joins, snapshot consistency, posting/reversal filters
   and migration replay before replacing the unavailable production providers.
5. Task 4.2 adds `ReportingSourceReader.readTimeEntries(tx, window)`, wrapped by
   the same RepeatableRead repository. D3/D4 supply persisted installation/service
   entries, stable unique IDs, consistent technician ID/name, approved status/time,
   positive exact hours, work occurrence and frozen hourly pay rate. Source queries
   must enforce the same date/status/approval predicates without multiplicative
   joins; the service also verifies them. No TimeEntry model exists on this branch,
   so the default reader throws `REPORTING_TIME_SOURCE_UNAVAILABLE` (503), never a
   fabricated empty report. Coordinate time schema/approval/frozen-rate migration
   with D3, and reconcile time/pay with posted labour using real PostgreSQL before
   enabling production. Existing ADMIN auth and all upstream schema gates apply.

Unit and HTTP tests exercise reconciliation, exact cents, bounds, scoped Prisma
queries, envelopes and access gates with injected adapters. They are not real
PostgreSQL acceptance evidence. See the [schema handoff](../../../../docs/architecture/d4-schema-handoff.md)
and [contracts](../../../../docs/architecture/api-contracts.md).
