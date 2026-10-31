# Technology choices, alternatives and deliverables reasoning

Decision date: 31 October 2026. This document explains the current scaffold and planned features; it does not change the stack or implement business workflows. Exact installed versions belong to the lockfile. The selected backend is NestJS 12.3.2, Prisma 7.10.1, PostgreSQL 17, with a Node 22 baseline.

## Constraints first

The [supplied organizer-video extraction](../requirements/organizer-video-deliverables.md) asks for a local MySQL/PostgreSQL database, custom APIs, dynamic persisted data, validation, clean UI, and all-member Git/presentation participation. It explicitly excludes BaaS. These are user-required planning constraints. The extraction is from a 2025 video; the specific current event rules are not independently verified. No claim that Odoo itself is required or that a public cloud URL/video is mandatory is justified by that document.

## Decisions and alternatives

| Decision | Problem solved / fit | Speed and learning | Integration and demo reliability | Tradeoff / risk | Essential? |
|---|---|---|---|---|---|
| **React + Vite**, rather than Next.js | Internal staff workflows need interactive forms and a clear custom-API boundary, not SEO | Team has used React/Vite; one frontend owner can reuse six page patterns | Vite dev proxy; compiled frontend served by Nest as one origin | Next can also self-host and implement APIs. We are not claiming it is unsuitable or disallowed; it offers no decisive advantage for this team | One UI framework essential; SSR unnecessary |
| **NestJS modular monolith**, rather than new Express conventions or Next Route Handlers | Guards, services and transaction helpers isolate business rules from UI | Team knows Nest concepts; source remains split across three backend owners | One release artifact and no remote function boundary; explicit custom REST endpoints | Nest adds decorators/configuration. Keep modules simple; no CQRS framework or circular service imports | Custom backend essential; separate network services unnecessary |
| **Prisma**, rather than Drizzle | Relations, typed queries and repeatable migrations | Prisma schema/client concepts familiar; Drizzle is a valid SQL-oriented alternative | Real PostgreSQL transaction tests, parameterized locking SQL, hand-reviewed constraints | Prisma does not make stock or money correct automatically; partial indexes/CHECKs need explicit migration work. Drizzle also supports transactions | One query/migration tool useful; a second ORM unnecessary |
| **Local PostgreSQL**, rather than Supabase/Neon/hosted DB | Relational integrity and concurrent stock operations; satisfies supplied local-DB constraint | Compose already exists and scaffold migration has been applied | Laptop works without venue internet; persistent volume | Team must manage startup, backups and restore. Do not substitute SQLite for concurrency acceptance tests | Essential under supplied requirements |
| **PostgreSQL-backed cookie sessions**, rather than Supabase Auth/OAuth/JWT refresh stack | Staff login, logout, revocation and role checks | Use established middleware and password hashing; no custom cryptography | Same-origin cookies; no third-party login dependency | CSRF, secure-cookie/proxy configuration and record authorization still require tests | Authentication necessary; social login and public signup unnecessary |
| **Private local files + DB metadata**, rather than S3/MinIO or blobs in tables | Store photographs, signatures and acceptance documents | D2 supplies one upload/download service; D4 attaches evidence | No network dependency; copy DB and matching files for recovery | Single-host design; filenames, limits, file authorization and backup consistency matter. Object storage can be added after the hackathon | File persistence essential; distributed storage unnecessary |
| **REST + shared Zod contracts**, rather than GraphQL/tRPC | Three backend owners must give one frontend owner stable payloads and errors | Existing TypeScript skills; shared request/response schemas | Same-origin calls, typed fixtures, bounded polling and explicit invalid-state errors | Runtime validation and authorized commands still required; shared types alone are not security | Shared contract essential; additional API protocol unnecessary |
| **Short DB transactions and synchronous services**, rather than workflow engine/event bus | Order/job/invoice, stock/cost and ticket/billing must commit together | Fewer moving parts; pass the caller's transaction to helpers | No eventual-consistency gap during the live demo | No file upload or external request inside transaction. Use stable locking order and bounded retries | Essential correctness mechanism; Kafka/Redis/workers unnecessary |
| **Tailwind + selected accessible primitives**, rather than bespoke UI or many libraries | One frontend owner needs consistent lists/forms/statuses | Build six patterns once; use selected shadcn/ui primitives when needed | Same spacing, keyboard/error behavior and responsive layouts across modules | shadcn components are not all installed/generated yet; no design-system rewrite or animation project | Consistency essential; large component catalogue unnecessary |
| **Local Compose application**, rather than Vercel + remote services | Same-origin app with local DB and persistent uploads | Existing Docker recipe; Node 22 image tested | Clean-machine startup and offline venue fallback; optional same composition on a permitted server | Loopback binding is deliberate. A phone needs USB forwarding or a separately configured trusted HTTPS path | Reproducible release essential; cloud hosting unverified as a submission requirement |
| **Focused API/PG/browser tests**, rather than broad testing infrastructure | Prove stock, idempotency, evidence and money invariants | Backend owners use familiar Jest/Supertest; D1 uses small component tests; one browser E2E flow | Test real PostgreSQL for concurrent allocation; record failures and repair them | These business suites are planned, not present in scaffold. Scaffold contract/smoke checks do not prove them | Critical invariant tests essential; huge browser matrix unnecessary |

## Familiarity is qualified, not overstated

StockSense used NestJS 10 and Prisma 5. Sunshine uses NestJS 12 and Prisma 7: the architecture and service/schema concepts are familiar, but the pinned majors are not identical. Prisma 7 introduces the driver adapter/configuration arrangement visible in this repo; Nest's module/runtime compatibility was checked in the scaffold. Earlier Nest 11 dependencies retained an audit finding, so the scaffold moved to the patched Nest release and was rebuilt and runtime-checked on Node 22. This is evidence of **foundation compatibility**, not proof of unimplemented domain behavior.

Do not change majors again during feature development without a concrete blocker. Freeze the lockfile and use `npm ci`. If a domain developer cannot use a selected API, inspect the pinned version's official documentation before proposing a framework change.

## Why this can stand out in a hiring hackathon

The supplied material emphasizes database design, logic, validation, modularity and shared explanation. Therefore build the demonstrable invariants: no quote before survey approval; no serial assigned twice; no repeated payment/movement on retry; delivery starts warranty once; service charge and internal cost remain distinct; customer confirmation gates closure. These are more defensible than another unconnected dashboard or an unsupported claim that competitors lack the feature.

## Source checks and limits

| Source | What it supports | Recheck / limit |
|---|---|---|
| [Official Odoo homepage](https://hackathon.odoo.com/) | General hiring/teamwork context and 24-hour final | Read 2026-10-31; not the specific event's scoring weights |
| [Specific event](https://hackathon.odoo.com/hackathon/details/69159) | Current event information would be authoritative | Retrieval unavailable on recheck; no new official submission claims |
| [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting) | Next can run outside Vercel | Read 2026-10-31; alternative is viable |
| [Vite guide](https://vite.dev/guide/) | Development/build tooling | Latest docs can differ from pinned Vite 7; use the lockfile |
| [Nest static serving](https://docs.nestjs.com/recipes/serve-static) | One Nest origin can serve the SPA | Earlier source read; latest re-fetch timed out. Scaffold runtime provides local evidence |
| [Prisma v7 transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions) | Transaction client and isolation options | Read 2026-10-31; business invariants still require our code/tests |
| [Drizzle transactions](https://orm.drizzle.team/docs/transactions) | Drizzle is a valid transactional alternative | Read 2026-10-31; rejection is about integration/familiarity, not missing transaction support |
| [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html) | Row locking and deadlock considerations | Read 2026-10-31; avoid unlocked read-then-write stock logic |

No pricing, performance multiplier, technology exclusivity or guarantee of winning is inferred from these sources.
