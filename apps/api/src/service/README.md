# Service module

Owner: **D4**. Status: **Task 2.2 lifecycle implemented; production integration gated**.

Saved coverage decisions, resolution notes and staff-recorded customer confirmation.
Repair billing and replacement orchestration remain Tasks 3.1/3.2.

## Commands

All routes return `{ data: ServiceTicket }`. Create returns 201; actions return 200.
All bodies are strict shared contracts; unknown fields are rejected with 400.

- `POST /api/v1/tickets`: `{ unitId, faultDescription }`. Derives customer/job
  from D3's real installation projection; an unassociated unit fails with 409.
  Creates an OPEN ticket and server-generated unique ticket number.
- `POST /api/v1/tickets/:id/assess`: `{ version, asOfDate, requestedScope }`.
  `asOfDate` is a timezone-qualified occurrence timestamp, at or before now.
  OPEN only. Evaluates the named work scope and atomically saves ASSESSED plus
  the full warranty decision, requested scope and server `assessedAt`. The
  decision's `asOfDate` remains the engine's IST calendar date. Historical
  assessments are staff recorded; coverage is not inferred from status alone.
- `POST /api/v1/tickets/:id/resolve`: `{ version, resolutionDetails }`.
  ASSESSED or IN_PROGRESS only; requires a saved assessment. Records notes and
  server `resolvedAt`, then moves to AWAITING_CUSTOMER_CONFIRMATION. No customer
  confirmation or closure is implied. IN_PROGRESS is reserved for future repair
  orchestration; this task permits direct ASSESSED to resolution as the plan asks.
- `POST /api/v1/tickets/:id/confirm`: `{ version, confirmerName, channel,
  confirmedAt, notes? }`. Awaiting confirmation only. Nonblank name, PHONE /
  WHATSAPP / IN_PERSON channel and timezone-qualified timestamp are mandatory.
  Confirmation must occur at or after resolution and at or before server time.
  All confirmation facts, server `closedAt` and CLOSED commit atomically.

Every action requires the current integer version; stale writes return 409
`STALE_VERSION`. Prisma uses status/version compare-and-set and increments the
version in the same transaction as the facts. Illegal transitions return 409
`INVALID_TICKET_TRANSITION`; unknown tickets return 404. Repeated actions cannot
overwrite snapshots or confirmation; after success, reload to obtain a new
version. They do not implement financial-command replay. This task posts no
stock, invoices, costs or warranty changes. Future repair orchestration must
add actor-scoped idempotency and use one transaction for its financial effects.

## Integration gate and tests

`ServiceModule` is registered in AppModule. Its default `ServiceTicketAccess`
returns 503 `SERVICE_AUTH_UNAVAILABLE` before any record read or mutation.
D2 must supply verified permission to manage tickets across customers. Never
trust role headers or unverified `request.user`. Assigned technicians require
record scoping before permitting this broad API.

The module reuses `WarrantyEquipmentReader` exported by WarrantyModule. D3 must
replace its unavailable implementation with actual Unit/customer/Job joins;
creation and assessment currently fail without it. The real Prisma repository
needs the coordinated D4 migration, including new resolution fields, Unit/Job
Restrict relations and integrity checks. Missing storage returns 503
`SERVICE_SCHEMA_UNAVAILABLE`. See the [schema handoff](../../../../docs/architecture/d4-schema-handoff.md).

Run `npm run test` and `npm run check`. `apps/api/test/service.test.cjs` tests the
real warranty engine with injected storage, concurrent CAS semantics, Prisma
query shape, Nest HTTP closure rejection and production authorization gating.
These doubles do not prove migrated PostgreSQL isolation or upstream joins.
No fixtures are wired into production. See [roles](../../../../docs/team/roles.md)
and [API contracts](../../../../docs/architecture/api-contracts.md).
