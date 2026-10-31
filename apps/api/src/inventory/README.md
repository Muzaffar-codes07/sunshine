# Inventory module

Owner: **D3**. Status: **receipts and stock reads implemented**; allocation, issues, transfers, counts and returns are planned.

The rules are in the [data model](../../../../docs/architecture/data-model.md#stock-ledger-owner-decision-31-oct).

- `StockLedgerService.post(tx, ...)` is the only code that writes `stock_movements`. Other modules must call it, with their own transaction.
- On-hand is read from the `stock_on_hand` view and never stored. A unit's location comes from the `unit_locations` view.
- `POST /api/v1/stock/receipts` posts a receipt in one transaction. A retry with the same key returns the saved response. A new key with the same reference and body also returns the saved receipt; the same reference with a different body returns 409 `IDEMPOTENCY_CONFLICT`.
- `GET /api/v1/stock`, `/stock/locations` and `/units?serial=` are the reads. All routes need WAREHOUSE or ADMIN.
- The database enforces the ledger: a movement must match a validated (DONE) document line, a DONE or CANCELED document and its lines can't change, a line change and validation wait for each other, and a unit's identity and cost are fixed. Only unit status and version can change.
- A retry must resend the original body: `2` and `2.000` count as different requests.
- Receipts need an `Idempotency-Key`. Their reference and payload hash are the permanent guard, so a new key can't receive the same delivery twice.
