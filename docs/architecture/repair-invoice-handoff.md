# Repair invoice writer handoff

D2 implements D4's ServiceInvoiceWriter port with InvoicesService.ensureServiceInvoice(tx, input). FinanceModule imports InvoicingModule and aliases the port to that same official writer. No public route is added.

The caller supplies trusted persisted repair-source facts, authorizes the actor, owns actor/key replay and the transaction, and must abort on every error. D4's RepairBillingService still owns the coverage decision, actual cost posts, ticket lines and immutable billing snapshot. Its default source reader and ticket authorization remain unavailable.

## Posting and replay

The source must be TICKET:<ticketId>:REPAIR. The helper locks that real ticket before reading or creating an invoice and verifies the ticket/job/customer and original order backlink. A new invoice requires an unresolved ASSESSED/IN_PROGRESS ticket with a valid, uncovered saved assessment for its actual unit. It never re-evaluates warranty policy.

Source/type pairs are unique. UUID case, line order and equivalent decimal spellings normalize before hashing. Quantity uses three decimal places, rates two, and integer arithmetic rounds each line half-up before summing. Supplied line totals and subtotal must reconcile exactly.

Invoice.sourceSnapshot stores revision1, the canonical payload and its SHA-256 privately. It includes every source ID/type, full trimmed description, job/customer and selling amount. Invoice display descriptions are abbreviated to 200 Unicode characters, with the full original retained in the snapshot. The HTTP invoice DTO does not expose this field. Sales invoices retain null.

Identical calls return the original invoice ID/subtotal even after receipts. Changed sources, type, full-description suffix or price refuse409 REPAIR_INVOICE_CONFLICT. The helper also checks persisted invoice lines, header and source snapshot rather than blessing damaged data. Legacy repair invoices without a snapshot refuse503 REPAIR_INVOICE_RECORD_INVALID; no history is silently reconstructed.

Posting uses the existing unique (TICKET, ticketId, REPAIR) source and no orderId. Tax is separately zero with the existing explicit unconfigured-tax note; subtotal is the pre-tax customer charge. An uncovered zero-subtotal batch produces PAID with no invented payment. Covered work bypasses the invoice writer entirely while D4 retains actual costs.

No independent transaction, commit, receipt or network/file operation occurs in the helper. The ticket lock serializes competing postings; caller retries still handle deadlocks/serialization conflicts.

## Schema and verification

A new nullable JSONB sourceSnapshot column is the only schema addition; existing invoices need no rewrite. Migration timestamp is pending D3 coordination. No applied migration is edited.

The real PostgreSQL suite apps/api/test/repair-invoices.db.test.mjs covers exact rounding and source snapshot/privacy, canonical replay, concurrency and competing facts, changed identity/description/prices, invalid/missing/covered work, zero charges, receipts, preceding caller-write rollback, damaged records and D4 billing/cost/invoice/ticket composition. The approved repair-source reader is explicitly synthetic; D2 and D4 writers and PostgreSQL transactions are real. A late caller failure must remove cost, invoice, lines and billing snapshot together.

This adapter does not enable production ticket commands or prove delivery/service completion. Those still require actual domain authorization/source adapters, actor-scoped command replay and frontend acceptance.
