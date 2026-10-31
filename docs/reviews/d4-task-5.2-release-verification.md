# D4 Task 5.2 integrated release verification

Verified on 31 October 2026 (Asia/Kolkata), against
`c2166b458d0c6ab26906dac98bf78e1da93cb257` plus the scoped changes on
`d4/task-1.1-contracts`. This supersedes the original isolated snapshot's
verification at `3a32fe2`; review the primary checkout for current work.

## Integration and repaired build blockers

The independent review of the original snapshot found no actionable defects.
Integration preserves the rebased `db:check` and `test:constraints` scripts and
all four Compose auth settings: `SESSION_SECRET`, `AUTH_TRUSTED_ORIGINS`,
`SESSION_COOKIE_SECURE` and `TRUST_PROXY`. Root typechecking now includes the
invariant suite. Focused invariant runs still require freshly built API/contracts;
the full test/check commands build these dependencies automatically.

The newer main contained an unrelated release blocker: routing commit `961fb8d`
truncated `App.tsx` midway through the PostgreSQL status JSX. Both host TypeScript
and Linux image compilation reproduced TS17008/TS1005. Restoring the missing tail
from the earlier working component exposed TS2307 imports for `PublicEnquiryPage`
and `components/ui/Field`, neither of which exists in Git history. The minimal
build fix restores Home/Status, removes the dangling `/enquire` route, and replaces
the development spike's absent Field wrapper with native labels, hint IDs and
inputs. `/` and the DEV-only `/spike` route remain; the real enquiry frontend
awaits D1's component. No substitute form or production success response is added.
These two frontend files are committed separately from the Task 5.2 changes.

## Observed checks

- `npm run check`: exit 0. Docs/plan references, Prisma validation/generation,
  workspace/seed/invariant TypeScript and frontend/backend builds pass.
  Its `npm test` run executes **163 tests: 94 API, 53 contracts, 12 seed and
  4 cross-service invariants; 0 failed, 0 skipped**.
- `npm run typecheck -w @sunshine/web`: exit 0 after the build fixes.
- `docker compose up -d --wait db`: exit 0, PostgreSQL healthy.
- `npm run db:deploy`: exit 0. Applied the three existing auth-session,
  enquiry-money and catalogue migrations; five repository migrations are now
  deployed. No new migration, D4 schema deployment, staff seed or demo seed ran.
- `npm run smoke`: exit 0 on the integrated host build. Liveness, real DB
  readiness, `/` and `/sales` SPA serving, structured API 404 and request ID
  pass. A separate temporary API with an unavailable loopback DB returns a
  sanitized 503 while liveness stays 200. Temporary child APIs are stopped.
- Scoped whitespace and smoke-script syntax checks pass. Existing zod/Rollup
  annotation warnings are nonfatal. Vite validation runs outside the Windows
  sandbox because it needs ancestor-directory access.

Final integrated image packaging and container HTTP smoke are **blocked by the
host storage failure**, not recorded as a pass. The old isolated snapshot's
Docker smoke result does not certify this integrated release.

The first integrated image compiled successfully but failed in the old recursive
`chown -R node:node /app` step when the host C: drive reached zero free bytes.
Docker reported BuildKit/containerd storage I/O errors. Only generated
dependencies from this task's historical verification worktree were removed;
its source and Git state were preserved. Docker recovery preserves images and
database/upload volumes. The Dockerfile now owns the empty `/app` directory up
front, installs/builds as `node`, and uses `COPY --chown=node:node`, avoiding the
large recursive ownership layer while keeping the original write permissions.
The Linux compilation pass above occurred before this ownership change; the
revised Dockerfile still needs a fresh build once the engine is available.
After freeing task-generated files, roughly 1.5 GB of host space was available.
Docker Desktop recovery still reported `starting`; engine requests returned
HTTP 500 and then a context-deadline timeout. Unused build-cache cleanup could
not complete because the engine was unavailable. No images, containers or
database/upload volumes were deleted.

To finish container acceptance after storage recovery: build the current image,
run the explicit image `db:deploy`, start with `up -d --wait app`, then run
`npm run smoke:docker`. Check UID 1000 and upload/CLI permissions with the new
ownership sequence. This is a remaining environment verification task.

## Boundaries and operational state

The four invariants compose real D4 services with test-only storage, stock,
source and invoice adapters. They verify IST coverage, saved decisions, cost
deduplication, zero-charge versus chargeable billing, original-job profitability,
replacement policy/lineage/replay, and real Nest HTTP confirmation validation.
They do not prove PostgreSQL D4 isolation/rollback, physical stock eligibility,
or an authenticated business lifecycle. Unit/Job/time/source/invoice integration,
D4 access adapters and the coordinated D4 migration remain dependencies.
Platform staff sessions exist; the unavailable D4 access providers stay gated.

Local session configuration was generated privately in ignored `.env` where
required. No secret values, configuration contents or credential URLs are
recorded in this report or commit. Unrelated local guidance and the existing
repair-billing whitespace edit are excluded from these commits.

See the [independent review prompt](d4-task-5.2-review-prompt.md) for actionable
finding requirements and integration checks.
