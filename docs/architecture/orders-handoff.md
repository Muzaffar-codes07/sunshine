# Orders, invoices and receipts (C5) handoff

Owner: D2. Requirements R7, R8 and R21. Migration `20261031180000_orders`.

## Routes

| Route | Who | Behaviour |
| --- | --- | --- |
| `POST /api/v1/orders` | SALES, ADMIN | Body `{quoteId}` plus an `Idempotency-Key` header. Confirms the latest accepted quote. |
| `GET /api/v1/orders/:id` | SALES, ADMIN, WAREHOUSE | Order with packing requirements, invoice, payments and `released`. |
| `GET /api/v1/enquiries/:id/order` | SALES, ADMIN | The enquiry's order. |
| `GET /api/v1/invoices/:id` | SALES, ADMIN | Invoice with lines, payments and balance. |
| `POST /api/v1/invoices/:id/payments` | ADMIN | `{amountInr, method, reference, receivedAt}` plus `Idempotency-Key`. Records money already received. |

Recording money needs an explicit finance permission (PRD), so only ADMIN may post receipts. Viewing an order does not allow it.

## What confirmation does, in one transaction

1. `QuotesService.requireAcceptedQuote(tx, quoteId)` share-locks the enquiry and requires the latest accepted revision.
2. It creates one `Order`. Orders are unique per quote **and** per enquiry, so a later quote revision can never become a second sale. `QuotesService` also refuses every quote change once an order exists (`ORDER_ALREADY_CONFIRMED`).
3. It creates one `PackingRequirement` per COMPONENT quote line: `quoteLineId`, `productId` and `quantity`.
4. `InvoicesService.ensureSalesInvoice` posts one invoice with the unique source `(ORDER, orderId, SALE)`. Its lines are the quote's PACKAGE and SERVICE charges only. Components are zero-priced, so hardware is never charged twice.
5. If D3 has wired `ORDER_JOB_CREATOR`, it calls `ensureJob(tx, facts)` and stores the job ID. If that call fails, nothing is created.
6. The idempotency command store records the response. A retry with the same key and body replays it.

Tax is not configured. Invoices carry `taxAmount 0` and the note "Tax not configured: pre-tax management example", which makes no claim of zero rating.

## Receipts

- `InvoicesService.recordPayment(tx, invoiceId, receipt, actor)` locks the invoice row and refuses an amount over the balance (`PAYMENT_EXCEEDS_BALANCE`) or a payment on a paid invoice (`INVOICE_ALREADY_PAID`).
- The server decides the payment kind: ADVANCE for the first payment, FINAL for the one that clears the balance, PARTIAL otherwise. The invoice moves POSTED → PART_PAID → PAID.
- `(method, reference)` is unique, so one bank or UPI reference can't be counted twice.
- A date in the future is refused, with 5 minutes' tolerance.
- Database CHECKs keep total = subtotal + tax and 0 ≤ paid ≤ total, keep the status consistent with the paid amount, and exclude NaN.

## For D3

- **Job helper:** provide `ORDER_JOB_CREATOR` (`apps/api/src/orders/order-job.port.ts`) from the jobs module. It must use `tx`, be idempotent per `orderId` and never commit on its own. Until it's wired, `Order.jobId` is null, and D3 can create jobs for confirmed orders that don't have one.
- **Allocation:** allocate against `PackingRequirement.quoteLineId` (the COMPONENT quote line) and `productId`.
- **Payment gate:** `InvoicesService.getOrderPaymentFacts(tx, orderId)` returns `{status, total, paidAmount, balance, released}`. `released` is true once any payment (the advance) is recorded. A minimum-advance policy is deferred, and the readiness check decides what to require.

## For D4

- **Repair invoices:** the invoice table already allows `(TICKET, ticketId, REPAIR)` invoices with no order. A `ensureRepairInvoice` helper is the next addition to `InvoicesService` when D4's ticket model lands.
- **Reports:** read posted invoices and receipts. Invoice totals and receipts are separate measures (TRD reporting rules).

## For D1

- Send a fresh UUID as `Idempotency-Key` per click of "Confirm order" or "Record payment", and reuse it only when retrying that same click.
- Show `error.reasons[0].reason` and `nextAction` on a 409 refusal, and `fieldErrors` on a 400.
