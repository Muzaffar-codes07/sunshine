# Warranty module

Owners: **D3** activation; **D4** assessment. Status: **assessment implemented;
production lookup awaits upstream integration**.

Delivery-triggered coverage activation and equipment history. D4 owns coverage decisions.

`WarrantyService.evaluateWarranty(unitId, asOfDate, requestedScope?)` reads the
saved policy, evaluates its half-open IST calendar interval, and returns the policy
revision, scope, dates, assessment date and reason. Omitting `requestedScope`
evaluates only the named saved scope. Repair orchestration must pass the actual
work scope; component cover does not make unrelated labour free. Scope matching
is exact after trimming/case normalization; free-text policies are not parsed as
exclusion rules. Expiry is read from storage, never recalculated or extended.

`GET /api/v1/warranties/lookup?serial=...` is the canonical Task 2.1 route (the plan
also contains an inconsistent `/units/lookup` example). Optional `manufacturerId`
and `productId` disambiguate scoped serials. Serial normalization trims and
uppercases while preserving punctuation and internal whitespace. Unknown serials
return 404; multiple matches return 409 rather than selecting a customer's unit.

Covered work returns `customerCharge: "0.00"`, `chargeStatus: "FREE"`.
Other outcomes return `customerCharge: null`, `chargeStatus: "PENDING_ASSESSMENT"`:
lookup has no assessed parts/labour or billable-rate source. Task 3.1 prices repairs
through finance. A missing warranty returns null policy/dates, never invented
dates. This service writes no warranty, ticket snapshot, invoice or cost; Task 2.2
persists the returned assessment on tickets. Supplier recovery is separate.

## Integration gate

Unit/Job models, staff authentication and the coordinated D4 migration are now
present, but the domain-specific authorization and equipment adapters below
remain unavailable; schema availability alone does not wire production access.
`WarrantyModule` is registered, but its default `WarrantyLookupAccess` rejects
requests with 503 `WARRANTY_AUTH_UNAVAILABLE` before any equipment read. Replace
it with D2's verified staff authorization adapter (401/403 as appropriate). Never
authorize from a caller-supplied role header or unverified `request.user`.

Replace `WarrantyEquipmentReader` with D3's persisted adapter. It must return
bounded unit/customer/job projections from actual allocation/installation joins,
apply manufacturer/product scope, and return at most two serial matches. Null
customer/job means no installation association. Staff access must authorize this
cross-customer lookup; assigned-technician access needs record scoping before
returning any customer information. No fabricated database tables or fixtures
are wired into production. Until supplied, the adapter returns 503
`WARRANTY_EQUIPMENT_UNAVAILABLE`.

`PrismaWarrantyReader` uses the actual Warranty model, including inactive rows.
Its storage requires the D3-coordinated migration described in the
[schema handoff](../../../../docs/architecture/d4-schema-handoff.md); missing
table/column errors become 503 `WARRANTY_SCHEMA_UNAVAILABLE`.

Run `npm run build -w @sunshine/contracts` then `npm test -w @sunshine/api`.
The warranty test suite checks date/leap/month-end boundaries, missing/void/scope
cases, serial ambiguity, the Prisma reader and real Nest HTTP routing using
injected adapters. It does not claim a migrated PostgreSQL/Unit/Job integration.
See [roles](../../../../docs/team/roles.md) and
[API contracts](../../../../docs/architecture/api-contracts.md).
