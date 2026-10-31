# Review prompt: D4 Task 2.2

Review D4-plan.md Task 2.2 (S06), Service Ticket Lifecycle & Customer Confirmation
Gate, in this Sunshine working tree. Read AGENTS.md, README.md,
docs/team/roles.md, D4-plan.md Task 2.2, docs/TRD.md service/version rules,
docs/architecture/api-contracts.md, docs/architecture/d4-schema-handoff.md and
apps/api/src/service/README.md first. Current files and user instructions take
precedence over saved Auric context and historical role assignments.

Baseline HEAD when work began: ff18d802f7f18b6fac3b67dc0b2e0ef50ba464d6,
branch d4/task-1.1-contracts. Inspect untracked files as well as git diff.
Review these changes only:

- apps/api/src/service/service.service.ts
- apps/api/src/service/service.repository.ts
- apps/api/src/service/service-access.ts
- apps/api/src/service/service.controller.ts
- apps/api/src/service/service.module.ts
- apps/api/src/service/README.md
- apps/api/src/warranty/warranty.module.ts (WarrantyEquipmentReader export only)
- apps/api/src/app.module.ts (ServiceModule import/registration only)
- packages/contracts/src/service.ts
- apps/api/test/service.test.cjs
- packages/contracts/test/service.test.cjs
- prisma/schema.prisma (ServiceTicket resolutionDetails/resolvedAt only)
- docs/architecture/api-contracts.md (Task 2.2 section/status only)
- docs/architecture/d4-schema-handoff.md (Task 2.2 resolution/ordering additions only)
- D4-plan.md (local, ignored implementation status only)
- this review prompt

Concurrent Task 4.1 reporting code/tests/contracts/docs, subsidy schema fields,
and existing .gitignore/.cursor/AGENTS.md changes are outside this review. Do not
revert, stage, commit or edit anything; report findings.

Check these areas:

1. Correct OPEN -> ASSESSED -> AWAITING_CUSTOMER_CONFIRMATION -> CLOSED lifecycle.
   Resolve may also accept IN_PROGRESS for future repair orchestration. The task
   explicitly permits resolution directly from ASSESSED; a start endpoint is
   outside this task. CLOSED must be terminal. No status-only closure route.
2. Strict closure gate for both internal service calls and HTTP: nonblank
   confirmerName, PHONE/WHATSAPP/IN_PERSON channel, timezone-qualified confirmedAt.
   Confirmed time cannot precede resolution or exceed server now. Missing/blank
   facts must give standard 400/409 envelope and preserve all ticket state.
   Check resolution notes/time, nullable confirmation mapping and server closedAt.
3. Assessment uses the real WarrantyService with actual requested work scope and
   occurrence instant. Persist full policy revision/scope/dates, reason, IST
   assessment date, requestedScope and server assessedAt atomically with ASSESSED.
   No fabricated billable prices; uncovered charge stays null/PENDING_ASSESSMENT
   until Task 3.1. Later policy edits must not rewrite the saved decision.
4. Require current version on every transition. Check the Prisma transaction's
   status/version compare-and-set, version increment and returned committed row.
   Concurrent requests must not overwrite decisions or confirmer facts. Distinguish
   test-double CAS coverage from real PostgreSQL concurrency/rollback evidence.
5. Creation derives customer/job from the unit installation rather than caller
   linkage, rejects uninstalled or mismatched equipment, and server-generates a
   ticket number. Assessment verifies stored linkage. Strict requests must reject
   status, snapshot, price and other server-owned overrides. IDs/date/text/version
   validation and bounded success projections must use shared runtime contracts.
6. All four routes must be registered and guarded before record reads/writes.
   Current branch lacks verified auth, Unit/Job models and coordinated D4 migration.
   Default ServiceTicketAccess must return 503; forged role headers must not bypass
   it. The future D2 adapter needs cross-customer management permission; assigned
   technicians need record scoping before gaining access. Reuse WarrantyModule's
   equipment boundary; no production fixtures or invented upstream models.
7. Verify real Prisma storage queries and missing-table/column 503 mapping. New
   resolutionDetails/resolvedAt fields must be included in D3 migration handoff
   with resolution/confirmation ordering CHECKs and Unit/Job Restrict relations.
   No premature migration or claim of full persisted production integration.
8. Scope boundary: this task records resolution notes; stock, repair billing,
   replacement and actor-scoped financial command replay belong to Tasks 3.1/3.2.
   No direct finance/stock/warranty mutation and no unexpected dependency cycle.
   Look for additional work possible within Task 2.2 despite upstream blockers.

Run `npm.cmd run check` when dependencies are available. Targeted commands:

```powershell
npm.cmd run db:generate
npm.cmd run build -w @sunshine/contracts
npm.cmd test -w @sunshine/api
npm.cmd test -w @sunshine/contracts
git diff --check
```

Return actionable findings in severity order, with file/line references,
reproduction and proposed fixes. Separate implementation bugs from known
integration blockers. If no bugs are found, say so and list remaining validation
gaps. Do not modify or commit in this review pass.
