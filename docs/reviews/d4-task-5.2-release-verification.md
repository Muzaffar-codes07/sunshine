# D4 Task 5.2 verification evidence

Verified on 31 October 2026 (Asia/Kolkata). Implementation baseline:
`3a32fe24731166fa8fe1739b1f3d513286b4849d`, originally
`d4/task-1.1-contracts`. This records observed results, not full D4 business
acceptance. No commit or push was made by this task.

## Tested snapshot and concurrent workspace change

During verification, another session stashed the task and rebased the primary
checkout onto newer main. Its stash was named
`codex-pr8-rebase-20261031-task5.2`. That session's history, conflicts and stashes
were left untouched. The scoped task files were recovered into the detached
worktree `var/task52-verification/` at the original baseline. All final checks
below use that saved source. The rebase later completed at `cd44afb`; this task
has not applied its patch to that newer checkout. Revalidate after integration.

## Commands and observed results

- `npm ci` in the isolated worktree: exit 0, lockfile installation succeeded.
- `npm run check`: exit 0 in the isolated worktree. Documentation/plan references,
  Prisma validation/generation, workspace TypeScript checks, seed/test TypeScript,
  and web/API production builds passed. `npm test` executed 82 API, 38 contract,
  12 seed and 4 new cross-service invariant tests: **136 passed, 0 failed,
  0 skipped**. The focused `npm run test:invariants` also passed all four.
- `docker compose up -d --wait db`: exit 0 after starting the installed Docker
  Desktop; PostgreSQL 17 became healthy. This created a fresh project DB volume.
- `npm run db:deploy`: exit 0; applied only the two existing platform/enquiry
  migrations. No D4 migration or demo seed was run.
- `docker compose --profile app build app`: exit 0; clean image dependency install
  and Linux production compilation passed. The existing recursive ownership
  step took about 213 seconds on this machine; it completed successfully.
- `docker compose -p sunshine --profile app run --rm app npm run db:deploy`:
  exit 0 using the saved worktree's Compose file and built image; no pending
  migrations. The explicit project name selects the existing release DB/image.
- `docker compose -p sunshine --profile app up -d --no-build --wait app`:
  exit 0. Both `sunshine-app-1` and `sunshine-db-1` reported healthy.
- `npm run smoke:docker` in the isolated worktree: exit 0 against the running
  container on loopback port 3001. Liveness, real DB readiness, `/` and `/sales`
  SPA serving, API 404 envelope and request ID all passed.
- `npm run smoke` in the isolated worktree, after its build and ignored local
  demo configuration: exit 0. Both the healthy DB checks and isolated unavailable
  local DB returning sanitized 503 while liveness remains 200 passed. Temporary
  API children were stopped by the script. The production container was not
  stopped or used to simulate the outage.
- `git diff --check`, `node --check scripts/smoke.mjs` and Compose configuration
  validation passed. Vite initially failed under the Windows sandbox because
  it could not read an ancestor path; full checks passed outside that restriction.
  Nonfatal existing Rollup annotations from zod were emitted during builds.

Built release image ID:
`sha256:5bfe1e5b049268f4fe35c99b193847108968a3147b45e68428a3bafcd5d3d729`.
The container's Node process reported UID 1000. The smoke script SHA-256 matched
between the image and recovered source:
`944187c93dec67016b642bb1ff4ea8a9db5b1c7528336f9b028c1a8a14284f82`.
The image was built before the concurrent rebase from this task's code; later
review/evidence documentation is not part of that image.

## Operational state and remaining acceptance

The release app and DB remain running, bound to `127.0.0.1:3001` and
`127.0.0.1:55439`. Volumes are retained. Stop the app container before native
development on 3001; do not remove database volumes to switch modes. Missing
local `.env` files were created from the repository's demo example, ignored by
Git. No configuration contents or credentials are recorded here.

The four new invariants use real D4 services with test-only storage, inventory,
source and invoice adapters. They prove service composition and HTTP validation,
not PostgreSQL uniqueness/isolation/rollback or actual physical stock mutation.
The original baseline lacks Unit/Job/time integration, real D2/D3 writers,
verified staff authorization and the coordinated D4 migration. Those upstream
requirements still gate live D4 business acceptance and the historical demo
seed. Infrastructure health cannot certify an authenticated end-to-end repair.
Newer main/review changes require their own integration validation.

Use the [independent review prompt](d4-task-5.2-review-prompt.md) to obtain
reproducible findings with exact locations, minimal fixes and regressions.
