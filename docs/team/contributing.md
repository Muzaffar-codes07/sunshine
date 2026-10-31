# Parallel contribution guide

1. Read [roles](roles.md) and the [API contracts](../architecture/api-contracts.md).
2. Branch from current `main`: `d1/sales-form`, `d2/survey-gate`, `d3/allocate-stock`, `d4/coverage-decision`.
3. Keep changes to one complete behavior; integrate every 60–90 minutes. Another developer reviews correctness, contracts and validation before merge.
4. D1 owns production frontend files. Backend owners supply examples and join scheduled integration slots.
5. Coordinate shared-file edits: D2 package/lock/config/release, D3 Prisma/migration/seed sequencing, domain owner shared contract, D1 routes/tokens.
6. Make migrations reproducible; never use untracked schema changes or delete a teammate's migration. Append a new migration after coordination. Follow the [schema conventions and migration queue](../architecture/schema-conventions.md).
7. Backend owners may use fixtures while implementing, but final production routes must read/write PostgreSQL. Fixtures are never a substitute for a successful business action.
8. No secrets, `.env`, actual customer data, uploads, DB dumps or generated Prisma client in Git. `.env.example` uses local demonstration credentials only.
9. Run `npm run check` and relevant domain tests. For stock/money rules use a real test PostgreSQL instance, not mocks alone.
10. All code is written fresh for Sunshine; do not copy source from earlier projects. All members commit and can explain their own code.
