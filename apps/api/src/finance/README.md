# Finance module

Cost writer: **implemented by D4 (Task 1.3)**. Invoices and payments: **D2, planned**.

`FinanceModule` exports `CostWriterService.postCost(tx, input)`. Import this module
in each consuming domain module and pass its existing `Prisma.TransactionClient`.
The helper never opens a transaction or commits independently; the caller owns
commit, rollback and bounded retries for serialization/deadlock conflicts.

Inputs use the shared `CreateCostEntryInput` contract. Money stays a nonnegative
decimal string through validation and insertion, with no JavaScript number
conversion. Prisma returns a `CostEntry` whose amount is a Decimal.

The compound key `(uniqueSourceId, costType)` identifies one posting. Namespace
sources as `STOCK_MOVEMENT:<id>`, `TIME_RECORD:<id>` or `TIME_ENTRY:<id>`. Duplicate
inserts are skipped by PostgreSQL and return the original row, including when
the retried payload differs. Posted rows are never overwritten. This helper is
business-source deduplication; outer commands still enforce the TRD's
actor-scoped idempotency-key/payload-conflict rules.

D3 posts consumed parts and installation labour; D4 posts service labour. A
ticket total is an aggregation and must not be posted as another expense. Source
ownership, source/job consistency, authorization and workflow locks belong to
the calling domain. The current compound key does not prevent the same source
being posted under a second cost type; callers must choose one canonical type.

No cost endpoint, invoice/payment writer or migration is included. Before using
the helper against PostgreSQL, complete the
[D4 schema migration gate](../../../../docs/architecture/d4-schema-handoff.md),
including the Job relation and SQL constraints. Unit tests use a transaction
double and do not certify PostgreSQL concurrency, isolation or rollback.

Run `npm test` from the repository root to build contracts and run the unit
tests. See [TRD boundaries](../../../../docs/TRD.md) and
[API contracts](../../../../docs/architecture/api-contracts.md) for integration.
