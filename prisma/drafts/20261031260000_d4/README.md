# Former D4 draft

Files #32 has merged. The verified SQL was promoted to
[`prisma/migrations/20261031260000_d4/migration.sql`](../../migrations/20261031260000_d4/migration.sql),
and its canonical rules are in the active root manifest. The duplicate draft SQL,
manifest and staging helper were removed to prevent competing migration copies.

Use the [current migration guide](../../../docs/architecture/d4-migration.md)
for fresh queue replay, schema diff and database testing. The
[preparation verification record](../../../docs/reviews/d4-coordinated-migration-verification.md)
retains the earlier conditional-draft provenance. D3 review and outstanding
allocation/replacement integrations remain required before final acceptance.
