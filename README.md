# Sunshine — Solar Installation Management

SunPower Solutions' enquiry-to-installation-to-service platform for the Odoo hackathon.

**Current state: runnable scaffold, not a completed business application.** The frontend, NestJS API, shared validation contracts, local PostgreSQL configuration and initial platform migration are implemented. Authentication, sales, inventory, installation, warranty, service and financial workflows are planned; their folders explicitly identify the owner and next work. The landing screen reports live infrastructure status and does not fabricate business data.

## Start here

- [Documentation index](docs/README.md)
- [PRD](docs/PRD.md), [PDR](docs/PDR.md), and [TRD](docs/TRD.md)
- [Consolidated product requirements and acceptance criteria](docs/requirements/product-requirements.md)
- [Four developer roles — one frontend, three backend](docs/team/roles.md)
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

The API fails startup if `DATABASE_URL` is absent. Readiness returns 503 if PostgreSQL is unavailable; liveness remains independent of the DB. No demo accounts or authentication endpoints exist yet. The initial migration creates only the user foundation; no business seed exists yet.

Shared contracts are built before development starts. If you edit them, run `npm run build -w @sunshine/contracts`; dependent processes then need to reload. Frontend requests go through Vite's `/api` proxy, avoiding a separate development CORS policy.

## Validate and build

```bash
npm run check
npm start
```

The production build is served by NestJS at <http://127.0.0.1:3001>. PostgreSQL and `.env` must remain available. `check` validates documentation references, Prisma schema, TypeScript, shared contracts and production builds. It does not claim to test unimplemented workflows.

After building and migrating with PostgreSQL running, `npm run smoke` starts temporary API processes and checks DB readiness, SPA/deep links, structured API errors and the unavailable-DB fallback. It stops those processes afterward.

## Full local container release

```bash
docker compose --profile app build app
docker compose up -d db
docker compose --profile app run --rm app npm run db:deploy
docker compose --profile app up -d app
```

The app and database use persistent named volumes. Migrations are explicit: startup never resets or reseeds data. `docker compose stop` retains data. Do not use `down -v` unless you intentionally want to delete local data.

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

The [role document](docs/team/roles.md) is authoritative for ownership. D2 owns finance writes; D3 owns warranty activation; D4 owns warranty decisions and read-only reports. Every member contributes commits and explains their work. Use short branches and small reviewed PRs. Do not copy StockSense code unless the organizers explicitly permit reuse.

The contents of `docs/research/history/` are retained discussion history, including the original Wedding/Solar comparison. They contain superseded stack and role proposals and are **not implementation instructions**.
