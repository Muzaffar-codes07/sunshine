# Inventory module

Owner: **D3**. Status: **receipts, transfers, counts and stock reads implemented**; allocation, issues, returns, serialized counts and receipt drafts are planned.

The rules are in the [data model](../../../../docs/architecture/data-model.md#stock-ledger-owner-decision-31-oct).

- `StockLedgerService.post(tx, ...)` is the only code that writes `stock_movements`. Other modules must call it, with their own transaction.
- On-hand is read from the `stock_on_hand` view and never stored. A unit's location comes from the `unit_locations` view.
- `POST /api/v1/stock/receipts` posts a receipt in one transaction. A retry with the same key returns the saved response. A new key with the same reference and body also returns the saved receipt; the same reference with a different body returns 409 `IDEMPOTENCY_CONFLICT`.
- `POST /api/v1/stock/transfers` and `/stock/counts` create drafts, which change no stock. `POST /stock/documents/:id/validate` posts every line or none, and `/cancel` closes a draft. Both take `expectedVersion` and an `Idempotency-Key`. A refused validation leaves the draft open. `GET /stock/documents/:id` reads one. To change a draft, cancel it and make a new one.
- Transfers and counts occur at validation, so they can't be backdated. A count measures on-hand under the lock and posts only the difference; a matching count completes with no movement. A surplus keeps the current average cost, and is refused if the product has no cost yet.
- A serial transfer names its units on the draft. Validation locks them and checks product, location and status. A unit moved into quarantine becomes `QUARANTINED`. Nothing leaves quarantine by transfer yet: that needs the inspection and release step, and for bulk the quarantine value carried back into the average. Serialized stock can't be counted by quantity yet.
- `GET /api/v1/stock`, `/stock/locations` and `/units?serial=` are the other reads. All routes need WAREHOUSE or ADMIN.
- The database enforces the ledger: a movement must match a validated (DONE) document line, a DONE or CANCELED document and its lines can't change, a line change and validation wait for each other, and a unit's identity and cost are fixed. Only unit status and version can change.
- A retry must resend the original body: `2` and `2.000` count as different requests.
- Receipts need an `Idempotency-Key`. Their reference and payload hash are the permanent guard, so a new key can't receive the same delivery twice.
