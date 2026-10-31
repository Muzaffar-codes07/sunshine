# Inventory module

Owner: **D3**. Status: **receipts and stock reads implemented**; allocation, issues, transfers, counts and returns are planned.

The rules are in the [data model](../../../../docs/architecture/data-model.md#stock-ledger-owner-decision-31-oct).

- `StockLedgerService.post(tx, ...)` is the only code that writes `stock_movements`. Other modules must call it, with their own transaction.
- On-hand is read from the `stock_on_hand` view and never stored. A unit's location comes from the `unit_locations` view.
- `POST /api/v1/stock/receipts` posts a receipt in one transaction. An identical retry returns the saved receipt; the same reference with a different body returns 409 `IDEMPOTENCY_CONFLICT`.
- `GET /api/v1/stock`, `/stock/locations` and `/units?serial=` are the reads. All routes need WAREHOUSE or ADMIN.
- The database enforces the ledger: a movement must match a validated (DONE) document line, a DONE document and its lines can't change, and a unit's identity and cost are fixed. Only unit status and version can change.
- A retry must resend the original body: `2` and `2.000` count as different requests.
- Receipts use their reference and payload hash as the permanent guard. They don't use the `Idempotency-Key` store yet, because #18 isn't on main.
