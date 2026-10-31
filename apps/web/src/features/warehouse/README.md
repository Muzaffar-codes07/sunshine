# Warehouse workspace

Owner: **D1**, the sole frontend developer. Status: **implemented**.

## Scope implemented
- Live inventory levels and As-Of historical reads (`GET /stock`, `GET /stock/as-of`)
- Movement ledger (`GET /stock/movements`)
- Live invariant integrity auditing (`GET /stock/integrity`)
- Inventory valuation report (`GET /stock/value`)
- Unit serial tracking and camera/manual scanner lookup (`GET /units`) using reusable `ScanInput`
- Goods receiving (`POST /stock/receipts`) with idempotency protection and contract validation

Authoritative stock balances are strictly computed and maintained by the backend services and PostgreSQL ledger; never recalculated in React.
