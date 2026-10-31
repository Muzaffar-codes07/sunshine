# Inventory module

Owner: **D3**. Status: **receipts, transfers, counts, order allocation and stock reads implemented**; dispatch, issues, returns, repair-part allocation, releasing a reservation, serialized counts and receipt drafts are planned.

The rules are in the [data model](../../../../docs/architecture/data-model.md#stock-ledger-owner-decision-31-oct).

- `StockLedgerService.post(tx, ...)` is the only code that writes `stock_movements`. Other modules must call it, with their own transaction.
- On-hand is read from the `stock_on_hand` view and never stored. A unit's location comes from the `unit_locations` view.
- `POST /api/v1/stock/receipts` posts a receipt in one transaction. A retry with the same key returns the saved response. A new key with the same reference and body also returns the saved receipt; the same reference with a different body returns 409 `IDEMPOTENCY_CONFLICT`.
- `GET /api/v1/stock/receipts/:id` reloads the posted receipt, including original exact costs, zero-cost reasons, actor, dates, movement and unit IDs. Later receipts or average-cost changes cannot rewrite it. Uses `stockReceiptResponseSchema`; unknown IDs and other document kinds return 404. Access remains WAREHOUSE or ADMIN.
- `POST /api/v1/stock/transfers` and `/stock/counts` create drafts, which change no stock. `POST /stock/documents/:id/validate` posts every line or none, and `/cancel` closes a draft. Both take `expectedVersion` and an `Idempotency-Key`. A refused validation leaves the draft open. `GET /stock/documents/:id` reads one. To change a draft, cancel it and make a new one.
- Transfers and counts occur at validation, so they can't be backdated. A count measures on-hand under the lock and posts only the difference; a matching count completes with no movement. A surplus keeps the current average cost, and is refused if the product has no cost yet.
- A serial transfer names its units on the draft. Validation locks them and checks product, location and status. A unit moved into quarantine becomes `QUARANTINED`. Nothing leaves quarantine by transfer yet: that needs the inspection and release step, and for bulk the quarantine value carried back into the average. Serialized stock can't be counted by quantity yet.
- `POST /api/v1/orders/:id/allocations` reserves every requirement on a paid order, or none. It takes `expectedVersion` (the job's version), an `Idempotency-Key` and optional `unitIds`. Without `unitIds`, it picks the oldest available units. A shortage names every line that's short. `GET /orders/:id/allocations` reads them.
- Free stock is usable on-hand minus RESERVED allocations, and `GET /stock` shows both. A bulk transfer can't leave a location below what's reserved there. A reserved unit can't be transferred at all.
- One warehouse (ADR-06): allocation refuses if there isn't exactly one active usable location.
- `GET /api/v1/stock`, `/stock/locations` and `/units?serial=` are the other reads. All routes need WAREHOUSE or ADMIN.
- `GET /api/v1/units/:id` traces a stable unit UUID to its receipt and current allocation/job/order/customer IDs. Identity, ledger-derived location and assignment are read in one REPEATABLE READ snapshot. Active assignments include RESERVED, DISPATCHED, DELIVERED and INSTALLED; RELEASED history is retained but excluded from the current assignment. This read does not implement dispatch or installation commands.
- The database enforces the ledger: a movement must match a validated (DONE) document line, a DONE or CANCELED document and its lines can't change, a line change and validation wait for each other, and a unit's identity and cost are fixed. Only unit status and version can change.
- A retry must resend the original body: `2` and `2.000` count as different requests.
- Receipts need an `Idempotency-Key`. Their reference and payload hash are the permanent guard, so a new key can't receive the same delivery twice.
