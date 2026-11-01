# Warranty module

Owners: **D4** assessment and the activation helper; **D3** calls the helper from delivery. Status: **assessment implemented;
production lookup and future-policy configuration use persisted adapters**.

Delivery-triggered coverage activation and equipment history. D4 owns coverage decisions.

## Policy terms

`product_warranty_policies` holds what each product's warranty promises today. `PrismaQuoteWarrantyPolicyReader` supplies a quote's frozen terms from it, so a later edit never changes cover already sold. `activateFromDelivery` starts the warranty from those frozen terms and refuses the delivery (503 `POLICY_DATA_INVALID`) if they are damaged.

`npm run seed:catalogue -w @sunshine/api` also inserts the synthetic demo terms: 240 months for panels (requirement R12's example), and 24 months for inverters, batteries and charge controllers (R12's example and the runbook's normal component duration). Rows are insert-only, so a rerun never overwrites an edited term. Quotes created before a term exists stay UNCONFIGURED. ADMIN can edit future terms at `/workspace/service`. No real vendor terms are invented: enter the approved name, revision, scope and duration. Existing quoted coverage never changes with catalogue edits.

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

## Production access and provenance

`StaffWarrantyLookupAccess` checks the actual active staff session before serial reads. ADMIN and SUPPORT can look up equipment; SALES, WAREHOUSE and TECHNICIAN receive 403 and anonymous/forged-header requests receive 401. Responses are `Cache-Control: no-store` and expose only unit identity, customer ID/name and job ID.

`PersistedWarrantyEquipmentReader` follows delivered/installed allocation → job → order/accepted quote/customer, validates source identity and delivery, and ignores reservations/releases as customer installation evidence. Scoped serial lookup returns at most two matches; ambiguity is 409 before either customer's installation is inspected. UUID inputs are canonicalized. `ValidatedWarrantyReader` compares saved terms and interval to the frozen quote and recorded delivery, never today's product policy; damaged or missing promised cover returns 503 `INVALID_WARRANTY_RECORD` for review. A successor pointer makes the old serial VOID for lookup even if an incomplete historical migration left `active=true`. A pointer alone does not prove actual replacement consumption/billing; successor coverage remains 503 `WARRANTY_REPLACEMENT_UNAVAILABLE` until that service writer is verified. This slice does not activate ticket commands or claim completed replacement work.

Migration `20261031820000_warranty_facts` validates a 1–1200 month calendar interval with month-end clamping and supported dates, freezes identity/terms/dates and blocks deletion/truncation/reactivation. Only `active=true → false` with `version+1` may change a warranty. Existing invalid intervals stop the upgrade for review; no historical facts are silently rewritten. The production reader additionally checks sale/delivery provenance; calendar validity alone is not proof of entitlement.

## Future-policy configuration

`GET /api/v1/warranty-policies/:productId` (ADMIN) returns `{data:{productId,policy,fingerprint}}`, with null policy/fingerprint when unconfigured. `POST` requires `Idempotency-Key` and `{expectedFingerprint,policyName,revision,scope,durationMonths}`. Limits are 200/100/2000 characters and 1–1200 whole months. Active serialized hardware only; strict inputs reject extra fields. Product UUIDs are canonicalized before hashing. A product row lock serializes absent-row creation and edits; a stale fingerprint returns 409 `STALE_POLICY`, changed terms with the old revision return `POLICY_REVISION_REQUIRED`, and identical actor/key/body replays its saved result even after later policy edits. Command results, new policy and key commit or roll back together. This configures future quotes and never edits existing snapshots or warranties.

The editor uses the shared retry-safe command: after an uncertain response it disables edits/product switching and retries the saved exact key/body. Reload before retrying a rejected stale edit. Ordinary lookup cannot accept a caller-selected historical date; the internal assessment service accepts an auditable occurrence supplied by service orchestration.

Run `npm run build -w @sunshine/contracts` then `npm test -w @sunshine/api`.
The warranty test suite checks date/leap/month-end boundaries, missing/void/scope
cases, serial ambiguity, the Prisma reader and real Nest HTTP routing using
injected adapters. The PostgreSQL warranty-policy suite additionally exercises real sales-to-delivery commands, roles, policy races/replay/rollback, scoped lookup, 18-month and expiry boundaries, SQL freeze/void guards and corrupt provenance. Its predecessor-pointer fixture is explicitly not a consumed/costed replacement.
See [roles](../../../../docs/team/roles.md) and
[API contracts](../../../../docs/architecture/api-contracts.md).
