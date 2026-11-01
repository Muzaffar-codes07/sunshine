# Sunshine — Solar Installation Management

SunPower Solutions' enquiry-to-installation-to-service platform for the Odoo hackathon.

**Current state: runnable partial application, with explicit integration gates.** The frontend, NestJS API, shared contracts and local PostgreSQL migration queue are implemented. Enquiry/qualification, surveys, catalogue, quotes/orders, inventory/reservations, jobs/scheduling and private-file APIs have implementations. D4 warranty/service/reporting logic and its coordinated schema are present, while production domain authorization, persisted source adapters and physical repair/replacement integration remain gated. Passing infrastructure checks does not establish a completed business lifecycle.

## Start here

- [Documentation index](docs/README.md)
- [Reviewed 38-feature report](docs/research/feature-selection/report.md) and [latest role-division brief](docs/team/role-division-brief.md)
- [PRD](docs/PRD.md), [PDR](docs/PDR.md), and [TRD](docs/TRD.md)
- [Consolidated product requirements and acceptance criteria](docs/requirements/product-requirements.md)
- [Earlier detailed role plan — component assignments await reconciliation](docs/team/roles.md)
- [Current architecture](docs/architecture/README.md)
- [Data model and transaction rules](docs/architecture/data-model.md)
- [24-hour execution plan](docs/planning/execution-plan.md)
- [Complete demo-focused build plan](docs/planning/demo-build-plan.md)
- [Technology choices and detailed reasoning](docs/architecture/technology-decisions.md)
- [Solar market research](docs/research/solar/README.md)
- [Authoritative problem statement](docs/requirements/solar-problem-statement.pdf)
- [Supplied organizer-video deliverables](docs/requirements/organizer-video-deliverables.md)

## Prerequisites

Node **22.12 or later** (Node 22 LTS is the reproducible default), npm 10+, and Docker Compose. Use `.nvmrc` if your environment supports it. Do not use Supabase, Firebase, or another BaaS: the supplied deliverables require a local relational DB and custom APIs.

## Local development

```bash
cp .env.example .env
npm ci
npm run db:up
npm run db:generate
npm run db:deploy
npm run dev
```

If the Compose app is already running, first use `docker compose --profile app stop app` before `npm run dev`; both use port 3001. Keep the DB running. For a phone, read [device setup and rehearsals](docs/planning/demo-runbook.md): the default loopback-only setup does not expose the app to a phone over Wi-Fi.

- Frontend: <http://127.0.0.1:5173>
- API liveness: <http://127.0.0.1:3001/api/v1/health>
- Database readiness: <http://127.0.0.1:3001/api/v1/health/ready>
- PostgreSQL: `127.0.0.1:55439` (loopback only; choose another port in `.env` if occupied).

The API fails startup if `DATABASE_URL` or a strong `SESSION_SECRET` is absent.
Readiness returns 503 if PostgreSQL is unavailable; liveness remains independent
of the DB. Staff login/logout/me use PostgreSQL-backed sessions. Demo accounts
are created only by the explicit staff seed command below; startup never seeds
them. The legacy two-case D4 seed preview is available via
`npm run db:seed -- --preview`; that legacy persisted entry point remains guarded.
The separate complete dataset below uses the implemented historical import.
See the [migration guide](docs/architecture/d4-migration.md) and
[seed handoff](prisma/seed/README.md). `db:deploy` applies migrations only and
never seeds.

For the complete 450-customer dataset, use the separate guarded
`npm run db:seed:demo` command and [450-customer setup](prisma/seed/DEMO450.md).
It imports synthetic CRM, sales, stock, completed installation and OPEN service
history into an explicitly designated disposable database. It does not enable
the physical repair/replacement adapters. `npm run db:verify:demo` reconciles the
persisted rows; `npm run demo:450` uses the private `.env.demo450.local` settings.

Shared contracts are built before development starts. If you edit them, run `npm run build -w @sunshine/contracts`; dependent processes then need to reload. Frontend requests go through Vite's `/api` proxy, avoiding a separate development CORS policy.

## Validate and build

```bash
npm run check
npm start
```

The production build is served by NestJS at <http://127.0.0.1:3001>. PostgreSQL and `.env` must remain available. `check` validates documentation references, Prisma schema, TypeScript, shared contracts and production builds. It does not claim to test unimplemented workflows.

After building and migrating with PostgreSQL running, `npm run smoke` starts temporary API processes and checks DB readiness, SPA/deep links, structured API errors and the unavailable-DB fallback. It stops those processes afterward.

`npm test` also runs `tests/d4-invariants.spec.ts`: real D4 service composition for
IST warranty expiry, covered/chargeable billing, source-cost deduplication,
replacement continuity and HTTP customer confirmation. Its storage, stock and
invoice adapters are test doubles; live D4 PostgreSQL acceptance still requires
the upstream integrations described in [testing](docs/planning/testing.md).
After building, run just this suite with `npm run test:invariants`.

## Full local container release

```bash
docker compose --profile app build app
docker compose up -d db
docker compose --profile app run --rm app npm run db:deploy
docker compose --profile app up -d --wait app
npm run smoke:docker
```

The app and database use persistent named volumes. Migrations are explicit: startup never resets or reseeds data. `docker compose stop` retains data. Do not use `down -v` unless you intentionally want to delete local data.

The app healthcheck uses database readiness. `smoke:docker` checks the running
container over HTTP on port 3001 without launching another API. Run native
`npm run smoke` separately for its isolated unavailable-database case.

## Repository layout

```text
apps/web/              D1: sole frontend owner
apps/api/src/          D2/D3/D4: backend domains
packages/contracts/    Shared request/response schemas and status definitions
prisma/                Schema and reviewed migrations; D3 coordinates
docs/                  Research, requirements, architecture, roles, execution plan
infra/                 Reproducible local deployment
scripts/               Repository validation helpers
tests/e2e/             Future integrated browser scenarios
```

## Ownership and contribution

The [role document](docs/team/roles.md) is authoritative for ownership. D2 owns finance writes; D3 owns warranty activation; D4 owns warranty decisions and read-only reports. Every member contributes commits and explains their work. Use short branches and small reviewed PRs. All code is written fresh for Sunshine; do not copy source from earlier projects.

The contents of `docs/research/history/` are retained discussion history, including the original Wedding/Solar comparison. They contain superseded stack and role proposals and are **not implementation instructions**.

## Customer portal

Customers whose enquiry includes an email can create an account at
`/customer/register`. Registration sends a 24-hour verification link to that
recorded email; only a verified account can sign in at `/customer/login`.
Configure `CUSTOMER_PORTAL_ORIGIN` and the `CUSTOMER_SMTP_*` values in the
local environment before enabling registration. SMTP requires TLS. Never put
real mail credentials in tracked files. An enquiry without an email needs its
contact email added by staff before self-signup.

The portal at `/customer/portal` shows only records linked to the signed-in
customer: overview, enquiry/order/installation progress, sent quotes, invoices
and paid balances, delivered equipment and warranty, service history, and
installation photos/signatures. Customers can edit their phone and address
after entering their current password. A new login email takes effect only
after verification at the new address. The portal does not submit service
requests or payments; it does not expose staff workspaces or internal cost
records. Staff sessions and customer sessions are separate identities in the
same rotating, HTTP-only session cookie.

Apply the `20261101090000_customer_portal` migration with the normal reviewed
`db:deploy` process before using the portal. Customer registration is not a
bulk seed of account passwords: each customer chooses a password and verifies
their email. If SMTP is not configured, registration returns a service-unavailable
error and the other application workspaces remain available.

## Staff sessions and local-demo accounts

After copying `.env.example`, generate a fresh session secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and place it in `SESSION_SECRET` before starting the API. `AUTH_TRUSTED_ORIGINS` lists exact frontend origins (scheme, host and port); the default example covers the local Vite and release URLs. Login, logout and cookie-authenticated mutations require a matching Origin, or an exact-origin Referer when Origin is absent. A missing/null/foreign origin is rejected. Anonymous public enquiry remains validated and rate-limited.

Apply all migrations and build. For an explicitly disposable local-demo database, set `DEMO_DATABASE_DISPOSABLE=true` and a unique `DEMO_STAFF_PASSWORD` (12–200 characters) in your local environment, then run `npm run seed:staff -w @sunshine/api`. This creates `admin@sunshine.test`, `sales@sunshine.test`, `warehouse@sunshine.test`, `technician@sunshine.test`, and `support@sunshine.test`, each with its matching StaffRole. The shared seed password is local-demo-only, read from the environment and never printed or committed. The seed refuses to run without the disposable-database opt-in. Remove that opt-in after seeding.

Auth endpoints: `POST /api/v1/auth/login` with `{email,password}`, `GET /api/v1/auth/me`, and `POST /api/v1/auth/logout`. Login rotates the session ID; logout removes it. Sessions last eight hours, and protected requests recheck the current active account and role. Other modules import AuthModule and apply AuthGuard plus RolesGuard and `@Roles('SALES', 'ADMIN')`; file/job/customer record ownership still needs its domain authorization check.

For a tested HTTPS deployment, set `SESSION_COOKIE_SECURE=true` and configure the exact public origin. Only set `TRUST_PROXY` for a known proxy/address range (for example `loopback`); it is disabled by default. Origin validation never trusts Host or forwarding headers.

`npm test -w @sunshine/api` runs the focused security unit checks. `TEST_DATABASE_URL=<explicit disposable test DB> npm run test:db -w @sunshine/api` runs API/session/role/revocation tests after migrations and build; the database name must contain `test`. These tests write rows and must never target the demo or real database.

Login allows five attempts per IP per minute. Teammates behind one NAT share this budget; avoid repeated account switching during the demonstration and wait one minute if limited.
