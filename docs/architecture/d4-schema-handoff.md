# D4 coordinated schema handoff

Task 1.2 adds `Warranty`, `ServiceTicket`, `TicketLine`, `CostEntry`, and
`SubsidyMilestone` to the Prisma schema on `d4/task-1.1-contracts`.
The initial migration is prepared at
[`prisma/drafts/20261031260000_d4`](../../prisma/drafts/20261031260000_d4/README.md).
It is deliberately outside the active migration queue while Files #32 is open.
No D4 migration is deployed to the application database. A disposable PostgreSQL
17.11 replay with the actual pending File SQL verifies the draft independently.

Follow the current [schema conventions](schema-conventions.md). D3 assigned
`20261031260000` in PR #8 comment 6547084767. D2 subsequently moved Files to
`20261031255000` (comment 6547220769), after D3's allocation-release slot 250000.
Keep the D4 slot unchanged and notify D3 before moving it.
Tables use plural snake case, columns retain camel case, IDs are native UUIDs,
money is `numeric(14,2)`, quantities are `numeric(12,3)`, occurrence timestamps
are `timestamptz(3)`, and warranty calendar dates are SQL `date` values in IST.
Mutable warranty, ticket and subsidy records carry optimistic versions.

## Contract mapping

- `TicketStatus`, `CostType`, `TicketLineType` and `ConfirmationChannel` use the
  Task 1.1 wire values, including `AWAITING_CUSTOMER_CONFIRMATION`.
- `TicketLine.type` maps to `lineType`; decimal values serialize as strings.
- Confirmation `confirmerName` maps to `confirmedBy` (a name, not a staff ID),
  `channel` to `confirmationChannel`, and `notes` to `confirmationNotes`.
- Task 2.2 adds nullable `resolutionDetails` text and `resolvedAt` timestamptz(3)
  to ServiceTicket. Include both in the queued migration. AWAITING_CUSTOMER_CONFIRMATION
  and CLOSED require nonblank resolution and a resolution time. Confirmation
  cannot precede resolution; CLOSED also requires the existing confirmation facts.
  The application stores the complete warranty decision plus `requestedScope`
  and `assessedAt` in assessmentSnapshot, with status/version CAS on each action.
- Warranty stores policy name, revision, scope and calendar duration. Its
  `active` flag disables/voids coverage; expiry is evaluated from the exclusive
  calendar boundary. A separate stored ACTIVE/EXPIRED status would become stale.
- Subsidy stage remains a configurable label. Its stored workflow status is
  `PENDING`, `SUBMITTED`, `APPROVED`, `REJECTED`, or `RECEIVED`, within the shared
  projection's string status. These are application labels, not eligibility rules.
- Task 4.1 adds `pendingDocuments` (text array, default empty) and optional
  `responsibleOwnerId` with a named Restrict relation to User and owner/status
  index. Include these in the queued migration; report buckets map PENDING to
  PENDING_DOCS and RECEIVED to DISBURSED, retaining REJECTED separately.
- Cost idempotency is the compound key `(uniqueSourceId, costType)`, as specified
  by Task 1.2. Callers must namespace the source by its source kind and ID.
- Cost entries now require caller-supplied `occurredAt` (`timestamptz(3)`), with
  occurrence indexes on `(jobId, occurredAt)` and `occurredAt`. Keep `postedAt`
  as server-recorded audit time. Period reports filter occurrence in `[start,end)`
  and `<= asOf`, plus posting `<= asOf`; lifetime costs use both cutoffs.
  Include this field and indexes in the initial coordinated D4 migration.
- Full reversals use signed `amount`, unique `REVERSAL:<original UUID>` sources,
  and nullable unique `reversalOfId` with a Restrict self-FK. Normal rows have
  nonnegative amounts and no link. Reversals negate the original amount and keep
  its job/type, and cannot precede its occurrence or target another reversal.
  The writer enforces these comparisons and immutable replay, including semantic
  Decimal equality; every conflict must abort the caller transaction.
  The queued migration must enforce source/link/sign shape, non-self reference,
  and immutable ledger rows; coordinate a cross-row trigger with D3 for exact
  original job/type/amount/time and non-nesting. Zero reversals serialize as zero.
  Do not add a blanket nonnegative amount CHECK to cost_entries.
- Task 3.1 adds nullable `ServiceTicket.billingSnapshot` JSONB to the queued
  migration. It stores revision 1, the SHA-256 of sorted type/source references,
  and the immutable billing result, including source/cost/price lines, totals and
  nullable invoice ID. Save it in the transaction that posts costs, invoice and
  ticket lines. Null means not billed; same references replay, changed references
  conflict. Billing's status/version CAS serializes against lifecycle mutations.
  Only the billing helper writes this snapshot; corrections require reversals.
  Only the isolated draft test database has received the D4 SQL so far.

## Migration dependencies

Task 3.2 also adds nullable native UUID `ServiceTicket.replacedUnitId` and
`newUnitId` (indexed), plus nullable JSONB `replacementSnapshot`. The ticket's
original `unitId` remains immutable. The snapshot stores revision 1, a canonical
input SHA-256 and the frozen old/new serial projections, continued warranty and
Task 3.1 billing result. Both lineage IDs and snapshot must be present together
or all null; enforce different old/new IDs and `replacedUnitId = unitId` with
CHECK constraints. Only the replacement helper writes these facts in the same
transaction as stock, warranty and billing. A later swap uses a new ticket.

Both ticket lineage IDs now have Restrict FKs to the real Unit model. D3's
`Unit.replacesUnitId` history link and actual replacement stock writer remain
unavailable; do not add a substitute field or enable production replacement.
Replacement result contracts use main's `QUARANTINED` and `RESERVED` unit states.
The original job/customer association checks and D3's one-active-unit allocation
index still apply.
Warranty creation for replacement must copy original start/expiry/policy/duration
and active exactly; the standard new-sale delivery activation must not overwrite
this continuation. New unit warranty uniqueness and original policy version CAS
must be covered in real PostgreSQL concurrent replacement/rollback tests.

Named `CustomerServiceTickets` and `ServiceTicketLines` relations have explicit
foreign keys with `onDelete: Restrict`. Do not add placeholder upstream tables.
The schema and draft now include the confirmed real relationships:

- `Warranty.unitId` and `ServiceTicket.unitId` relations to D3's `Unit`.
- `CostEntry.jobId`, `ServiceTicket.jobId`, and `SubsidyMilestone.jobId`
  relations to D3's `Job`.
- Nullable `SubsidyMilestone.evidenceFileId` references `files(id)` in the draft
  SQL with DELETE RESTRICT / UPDATE CASCADE. Add its Prisma File relation and
  reverse field when the actual File model merges; the branch currently retains
  the scalar because File is not on main. The draft must not be activated first.

The Unit/Job relations and reverse fields are implemented without placeholders.
Prisma validation alone does not prove referential integrity; the draft tests
inspect the actual PostgreSQL FKs. Runtime adapters must still validate matching
unit/job/customer/evidence ownership.

D3 owns the follow-up `allocations.ticketLineId` FK and quote-line XOR ticket-line
CHECK. Request 6547139166 asks D3 for the patch and its migration slot. The existing
quote-only allocation writer, source-check trigger and active-unit uniqueness are
unchanged here. Repair stock cannot be enabled by adding only the new column:
D3 must adapt its source validation and allocation behavior too.

For subsidy completion, D2 requires byte verification with `FilesService.download`
before the transaction, then `attach` and `requireEvidence` for the milestone's
JOB inside the caller transaction. This is the agreed future integration contract;
the present read-only subsidy reporting module does not implement completion.

SQL CHECK constraints cannot be expressed by these Prisma models. The later
draft enforces positive quantities and policy duration, nonnegative
money on ordinary costs and other money columns (signed linked cost reversals
are the explicit exception), nonblank required text, ordered warranty/subsidy dates, and confirmation
facts for CLOSED tickets (including nonblank confirmer, channel, confirmation
time and a closure time no earlier than confirmation). Register hand-written
constraints are recorded in the draft's PostgreSQL 17.11 manifest. Move them into
the active manifest only with migration activation, then replay the reviewed
queue and run the ordinary checker. Do not
treat this task's `prisma validate`/client generation as database or lifecycle
acceptance evidence. The Task 2.1 warranty engine and Task 2.2 lifecycle are now
implemented against these definitions; migration enforcement and upstream
integration remain outstanding. Add CHECKs for the Task 2.2 resolution and
confirmation ordering alongside the existing closure checks.
