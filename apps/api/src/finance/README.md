# Finance module

Cost writer: **implemented by D4 (Task 1.3)**. Invoices and payments: **D2, planned**.

`FinanceModule` exports `CostWriterService.postCost(tx, input)`. Import this module
in each consuming domain module and pass its existing `Prisma.TransactionClient`.
The helper never opens a transaction or commits independently; the caller owns
commit, rollback and bounded retries for serialization/deadlock conflicts.

Inputs use the shared `CreateCostEntryInput` contract. Money stays an exact
decimal string through validation and insertion, with no JavaScript number
conversion. Normal costs are nonnegative; full reversals are signed. Prisma
returns a `CostEntry` whose amount is a Decimal.

`occurredAt` is required: a timezone-qualified ISO instant with at most three
fractional digits, taken from the persisted stock movement or actual work time.
Never substitute approval, assessment, billing or posting time. The database
records `postedAt` separately. Reports use occurrence time for period membership
and require both timestamps to be at or before the query cutoff, so late costs
appear in their occurrence period when queried after posting.

The compound key `(uniqueSourceId, costType)` identifies one posting. Namespace
sources as `STOCK_MOVEMENT:<id>`, `TIME_RECORD:<id>` or `TIME_ENTRY:<id>`. Duplicate
inserts are skipped by PostgreSQL. Identical retries return the original row;
changed job, amount, occurrence, description or reversal link raise 409
`IDEMPOTENCY_CONFLICT` inside the caller transaction. Amounts compare with Decimal
equality (`600.2` equals `600.20`); timestamps compare as instants. Descriptions
are trimmed, and repair source adapters must return the same canonical source
description and occurrence that D3 posted. Posted rows are never overwritten. This helper is
business-source deduplication; outer commands still enforce the TRD's
actor-scoped idempotency-key/payload-conflict rules.

D3 posts consumed parts and installation labour; D4 posts service labour. A
ticket total is an aggregation and must not be posted as another expense. Source
ownership, source/job consistency, authorization and workflow locks belong to
the calling domain. The current compound key does not prevent the same source
being posted under a second cost type; callers must choose one canonical type.

To fully reverse a cost, call the same helper with `reversalOfId` set to the
original cost UUID, `uniqueSourceId: REVERSAL:<original UUID>`, the same job and
cost type, and the exact negated amount. Provide the correction event's actual
`occurredAt` (at or after the original occurrence) and a reason in `description`.
The helper reads the original in the supplied transaction and refuses missing
originals, partial/wrong-job/wrong-type reversals and reversals of reversals with
409 `INVALID_COST_REVERSAL`. Zero uses `0.00`, never negative zero. One unique
nullable self-link permits only one full reversal per original. A changed retry
still conflicts. A corrected positive expense uses a new canonical business
source after reversal; neither entry overwrites the original.

Task 3.1 exports `ServiceInvoiceWriter` as an explicit D2 integration port.
Its default implementation returns 503 `SERVICE_INVOICE_UNAVAILABLE`; it does
not implement invoice persistence. D2 must delegate `ensureServiceInvoice(tx,
input)` to its official finance helper using the supplied transaction and unique
ticket repair source. See the [repair billing contract](../service/README.md).

No public cost endpoint or D2 invoice/payment implementation is added by this
helper. The [coordinated D4 migration](../../../../docs/architecture/d4-migration.md)
now includes the real Job relation and SQL integrity rules. Unit tests use a
transaction double; `npm run test:d4-migration` separately verifies actual
PostgreSQL cost concurrency, replay and caller rollback on a disposable database.

Run `npm test` from the repository root to build contracts and run the unit
tests. See [TRD boundaries](../../../../docs/TRD.md) and
[API contracts](../../../../docs/architecture/api-contracts.md) for integration.
