# Demonstration dataset: 450 customers

Planning date: 1 November 2026. Baseline inspected: `main` at `b216ece`.
Status: implemented on `codex/demo-450-customers`; use the
[seed and verification guide](../../prisma/seed/DEMO450.md). The initial plan
below is retained as the agreed distribution. Runtime evidence is written to
ignored `var/demo450/verification.json` by the explicit verification command.

## Target

Create **exactly 450 distinct synthetic Customer records** in a dedicated demo
database. Every customer has at least one enquiry. Surveys, quotes, orders,
payments, equipment, jobs and service records are additional rows, so the total
database row count will be substantially higher. A customer with multiple
enquiries still counts once. This replaces the earlier interpretation of about
450 rows across all tables.

"Legitimate" means plausible facts, valid relationships and real application
behavior. These are clearly disclosed fictional customers and sample business
transactions, not claimed real customers or sales. Use no scraped personal data.

## Customer distribution

Assign each customer to exactly one furthest lifecycle stage:

- **100 new enquiries:** recent submissions with varied supported sources,
  capacities and site details; include assigned and unassigned work.
- **80 qualified leads:** recorded roof/bill/grid facts, owner and follow-up;
  include customers comparing options or waiting for a decision.
- **70 survey-stage customers:** 20 scheduled, 20 submitted, 20 approved and
  10 rejected with specific reasons. Revisions preserve previous decisions.
- **55 quotation-stage customers:** 15 draft, 25 sent, 10 rejected and 5
  accepted but not yet confirmed as orders. Their surveys are approved.
- **45 confirmed-order customers awaiting fulfilment:** valid accepted quotes,
  jobs, invoices and packing requirements; vary unpaid and advance-paid states.
  Payment readiness controls what may happen next.
- **40 fulfilment/field customers:** 10 reserved and ready to dispatch,
  10 dispatched, 10 delivered with field work scheduled and 10 with field work
  in progress or awaiting acceptance. These are descriptive groupings mapped
  to actual schema states; they are not new enum values.
- **60 completed-installation customers:** valid delivery, evidence, time,
  customer acceptance and financial history. Include 15 customers with service
  tickets as a deliberately selected demo cohort, not a measured failure rate.

These mutually exclusive groups total **450 customers**. The starting shape
implies at least 450 enquiries, 270 survey cases, 200 quotes and 145 orders/jobs/
sales invoices; actual revision and line counts are measured after import.
The cohort membership remains fixed even when the operator progresses a case.

Use all ten existing 1–5 kW On-Grid/Off-Grid package revisions, with a planned
315 On-Grid and 135 Off-Grid enquiries across the whole dataset. Keep capacities
weighted toward 2–3 kW, with meaningful 1, 4 and 5 kW examples. Every confirmed
sale uses a complete real package and frozen quote BOM. Include repeat enquiries
for a small subset only after the 450 unique customers are established.

## Five presentation records inside the 450

- **A, sales:** qualified enquiry with a submitted survey; leave approval and
  quote creation for the operator.
- **B, warehouse:** separate paid/advance-ready Off-Grid order with valid stock
  reservations and draft dispatch; leave a representative serial scan live.
- **C, field:** separate delivered job in progress; leave sample photo,
  signature and completion for the operator.
- **D, covered service:** Anita Sharma's fully paid historical installation,
  delivered 18 calendar months before the frozen anchor, with an inverter
  covered by a frozen 24-month component policy and an OPEN fault ticket.
- **E, expired service:** Rajesh Verma's fully paid historical Off-Grid
  installation, delivered 28 calendar months before the anchor, with an expired
  24-month battery policy and an OPEN ticket. Preserve the current seed's
  explicit product/system assumptions when implementing the real writer.

All five are included in the cohort counts. Prepared states are disclosed;
actions advertised as live remain unposted. Align D/E amounts and identities
with the final seed manifest and operator runbook before rehearsal: existing
planning documents contain differing ages/system examples and must not become
competing runtime sources.

## Realism rules

- Use coherent fictional names, varied addresses and consistent city/pincode
  pairs. Generate unique schema-valid synthetic phones and `example.invalid`
  emails. Treat all contacts as sample data; do not contact them.
- Relate requested capacity, shadow-free roof area, monthly bill, cable length
  and survey notes. Use explainable outcomes such as shading, access problems,
  revised measurements, customer postponement and budget approval pending.
  These are scenario assumptions rather than engineering sizing advice.
- Freeze one anchor in Asia/Kolkata. Spread recent pipeline activity across
  preceding weeks and months. For the 60 completed jobs, start with 30 delivered
  within 12 months, 20 at 13–23 months and 10 at 25–36 months. Order all enquiry,
  survey, acceptance, receipt, dispatch, delivery, completion and complaint times
  correctly. Preserve original dates on reruns; keep the system clock unchanged.
- Derive sale amounts from the existing fictional catalogue and frozen quotes.
  Use Decimal calculations, legitimate payment references, varied partial/full
  settlement and explainable balances. Historical service cases have settled
  original sales invoices. Sample amounts are pre-tax; assert no real subsidy
  entitlement or current market-price accuracy.
- Receive sufficient stock before allocating it. Preserve every serialized
  unit's receipt, acquisition cost, assignment, scan and movements. Include
  available spares and useful low-stock products; balances come from the ledger.
- Persist clearly labeled sample photos/signatures through private-file storage,
  with matching metadata and checksums. Prepared typed serials have truthful
  provenance; they are not evidence of a camera scan.
- The service cohort includes covered, expired and scope-review complaints.
  Let the actual coverage engine decide from saved policies and complaint dates.
  Post repairs, invoices, replacements and closure only through supported real
  writers, with the required confirmation and audit evidence.
- Add a small set of valid subsidy milestones with next owner and pending
  documents, using supported APIs. Keep sample application progress distinct
  from money actually received.

## Implementation sequence

1. Add a deterministic manifest: seed version, fixed anchor, reserved customer
   UUIDs, stable phone/serial/reference prefixes, stage membership and scenario
   expectations. Preview reports all 450 customers and expected entity counts
   without writing. Keep passwords and connection strings outside the manifest.
2. Reuse the guarded staff and full catalogue seeds. Create enough actual staff
   for ownership and non-overlapping crew schedules; do not assign hundreds of
   simultaneous jobs to the single default technician.
3. Implement the historical installation import against the actual schema.
   The completed bulk command is `db:seed:demo`; it uses an offline transaction
   adapter and the existing domain writers. The legacy two-scenario `db:seed`
   entry point remains guarded and separate. No placeholder installation or
   dangling Job/Unit references are used.
4. Add an explicit bulk-demo command requiring disposable-database opt-in and
   a designated target DB. Apply migrations explicitly first. Generate customer
   profiles and enquiries in bounded batches, then execute each deeper customer
   scenario atomically using domain services/transaction-aware writers. Use an
   audited historical import seam where dates cannot be supplied through normal
   APIs; preserve normal API protections and database constraints.
5. Use stable command keys and unique source IDs. A failed scenario rolls back
   its effects and can be resumed from the same manifest. Final success is
   recorded only when all 450 customers and expected histories pass validation.
   Reruns verify identities, retain original dates and preserve progressed cases.
   Avoid a single transaction covering all 450 customers and their evidence.
6. On fresh disposable PostgreSQL, measure real row counts, generation duration
   and query behavior. Use bounded concurrency and existing list pagination.
   Fix slow or failed paths before the demo; invent no performance claim.
7. Save a per-table count/reconciliation report, five demo entry points and a
   matching DB/files backup. Rehearse restoration and UI refresh. Startup never
   seeds or resets automatically; keep the seed command outside public routes.

## Verification and evidence

- Exactly 450 Customer rows; every manifest customer has its own valid identity
  and at least one related enquiry. Distinct normalized phones also total 450.
  Show cohort totals and additional rows per table separately.
- Run twice and compare business identities, counts, dates, quote snapshots,
  ledger sources and payment references. Rerun after progressing a demo record
  and verify the operator's changes survive.
- Force a late scenario failure and verify no partial money, stock, warranty or
  ticket effects. Reserved-ID/reference collisions fail rather than adopting
  unrelated records.
- Reconcile stock, invoice totals, payments, balances, actual costs and lifetime
  contribution from real readers against independent manifest expectations.
  Check report date filters in IST and match CSV output to the same scope.
- Verify D/E serial lookup, coverage, supported ticket actions, record ownership,
  evidence downloads and persistence after refresh through real APIs/UI.
- Exercise list search/filter/pagination with the full dataset. Confirm completed
  jobs have all required evidence and time records without technician overlaps.
- Probe insufficient stock, duplicate payments, unapproved quotes and missing
  evidence on a separate test DB. Invalid attempts do not become invalid demo rows.

Current service documentation still gates physical replacement and parts
integration. Populate only states supported by verified writers; the dataset
does not establish that an unavailable command works. Keep presentation D/E
OPEN until their intended real action is available and verified.

## Ownership

D4 owns the manifest, seed orchestration, count/reconciliation report and backup.
D2 supplies sales/finance/private-file writers; D3 supplies historical inventory,
dispatch and field facts and reviews migration sequencing. D1 verifies the saved
cohorts in the existing screens. Follow `docs/team/roles.md` for shared changes
and review. No schema change is justified merely to hold sample data.

Deliver a guarded seed command, deterministic 450-customer manifest, sample
evidence, verified count/reconciliation output and tested DB/files restore.
Preview output and unit doubles do not establish persisted acceptance.
