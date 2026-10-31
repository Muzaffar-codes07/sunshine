# Demo seed ownership

D3 coordinates idempotent seed functions from each backend owner. Never reset
on startup or seed an ordinary database implicitly.

- Staff: npm run seed:staff -w @sunshine/api requires explicit
  DEMO_DATABASE_DISPOSABLE=true and DEMO_STAFF_PASSWORD.
- Catalogue (D2): npm run seed:catalogue -w @sunshine/api requires explicit
  DEMO_DATABASE_DISPOSABLE=true. It inserts missing fictional products and
  complete package revisions without rewriting existing prices or BOMs.

Build before running these commands. The catalogue seed adds no stock, warranty,
invoice, payment, or historical installation. The separately historical
18-month demonstration installation remains the responsibility of the
business workflow seed.

See [catalogue handoff](../../docs/architecture/catalogue-handoff.md).
