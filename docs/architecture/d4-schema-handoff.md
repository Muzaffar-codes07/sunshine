# D4 Task 1.2 schema handoff

Task 1.2 adds `Warranty`, `ServiceTicket`, `TicketLine`, `CostEntry`, and
`SubsidyMilestone` to the Prisma schema on `d4/task-1.1-contracts`.
This is a validated model definition, not a deployed database change or an
implemented service. No migration is included or applied in this task.

Conventions were read from D3's open PR #4, commit
`5ecb93f4ed50e241f1408464a266f6b21df7138e`, because
`docs/architecture/schema-conventions.md` has not landed on this branch.
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
  No new migration is applied before the existing Unit/Job dependencies land.

## Migration dependencies

Task 3.2 also adds nullable native UUID `ServiceTicket.replacedUnitId` and
`newUnitId` (indexed), plus nullable JSONB `replacementSnapshot`. The ticket's
original `unitId` remains immutable. The snapshot stores revision 1, a canonical
input SHA-256 and the frozen old/new serial projections, continued warranty and
Task 3.1 billing result. Both lineage IDs and snapshot must be present together
or all null; enforce different old/new IDs and `replacedUnitId = unitId` with
CHECK constraints. Only the replacement helper writes these facts in the same
transaction as stock, warranty and billing. A later swap uses a new ticket.

Coordinate Restrict FKs for both lineage IDs to D3's Unit, plus D3's new-unit
`replacesUnitId` history link, same job/customer checks and the one-active-unit
allocation partial uniqueness constraint. The current schema has no Unit model;
do not create placeholders or treat scalar UUIDs as referential integrity.
Warranty creation for replacement must copy original start/expiry/policy/duration
and active exactly; the standard new-sale delivery activation must not overwrite
this continuation. New unit warranty uniqueness and original policy version CAS
must be covered in real PostgreSQL concurrent replacement/rollback tests.

Named `CustomerServiceTickets` and `ServiceTicketLines` relations have explicit
foreign keys with `onDelete: Restrict`. Do not add placeholder upstream tables.
Before generating or landing the D4 migration, coordinate with D3 to add:

- `Warranty.unitId` and `ServiceTicket.unitId` relations to D3's `Unit`.
- `CostEntry.jobId`, `ServiceTicket.jobId`, and `SubsidyMilestone.jobId`
  relations to D3's `Job`.
- Nullable `SubsidyMilestone.evidenceFileId` relation to D2's `File`.

These fields are currently indexed native UUID scalars without foreign keys;
Prisma validation does not prove referential integrity. The queued migration
must include the missing relations, reverse fields and explicit Restrict delete
behavior, plus service checks for matching unit/job/customer/evidence ownership.

SQL CHECK constraints cannot be expressed by these Prisma models. The later
migration must enforce positive quantities and policy duration, nonnegative
money on ordinary costs and other money columns (signed linked cost reversals
are the explicit exception), nonblank required text, ordered warranty/subsidy dates, and confirmation
facts for CLOSED tickets (including nonblank confirmer, channel, confirmation
time and a closure time no earlier than confirmation). Register hand-written
constraints in D3's required-constraints manifest when PR #4 lands, replay the
migration on disposable PostgreSQL, and verify the actual constraints. Do not
treat this task's `prisma validate`/client generation as database or lifecycle
acceptance evidence. The Task 2.1 warranty engine and Task 2.2 lifecycle are now
implemented against these definitions; migration enforcement and upstream
integration remain outstanding. Add CHECKs for the Task 2.2 resolution and
confirmation ordering alongside the existing closure checks.
