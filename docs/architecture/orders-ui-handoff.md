# Orders workspace handoff (B12)

Routes: /workspace/orders opens a known order ID; /workspace/orders/:id shows order details. Enquiry detail mounts QuotePanel after the site survey. There is no invented order-list API.

SALES/ADMIN create and revise terms from the latest approved survey and current package, record manual sending/acceptance/rejection, and confirm an accepted quote. Saved package/BOM/prices/warranty facts are displayed from the quote response; policy status is not a warranty activation claim.

Order confirmation captures one request body/key per intent. An uncertain failure retains it for the Retry confirmation button. Backend uniqueness and the command store remain the authority. The synchronous in-flight guard prevents a second submission before React rerenders.

ADMIN records actual received money with amount/method/reference/time. The form validates shared contracts and checks cents against the displayed balance; the locked server invoice is final authority. An uncertain network/5xx/invalid-response outcome keeps the exact body/key, freezes editing and offers same-receipt retry. A definitive 4xx permits correction. Successful receipt recording is distinguished from a later refresh failure. The form is keyed by invoice ID so unsaved state cannot cross to another invoice.

SALES can read the invoice and receipts but has no payment form. WAREHOUSE requests /orders/:id/fulfilment and parses its restricted DTO; it never requests or caches the financial order response. Other roles cannot open these views. Backend guards enforce the same boundary.

All responses use shared schemas through lib/api. 409 reasons show reason and nextAction; 400 errors map to fields. Query keys under ['enquiry',id,...] refresh enquiry/summary/quotes/order after writes. Order caches include financial/fulfilment view and actor/role. Logout already clears query state.

## Verification

Run npm run check. The explicit real-database UI proof is apps/web/test/orders-ui.db.test.mjs, after building API/contracts and migrating a disposable TEST_DATABASE_URL. It uses the real API helper, Nest/PostgreSQL and React rendering to cover quote creation/sending/acceptance, lost-response same-key order/receipt replay, one order/invoice/job, forbidden sales posting, admin controls, warehouse non-disclosure, 409 nextAction and the PAID summary. It does not claim browser interaction coverage.

Cross-review in an isolated browser/API/database is required for actual drawer actions, disabled/retry states and layout. Keep the shared demo unchanged. For a lost-response check, let the server commit then fail the client response; retry must retain the same header/body and produce one effect. Verify altered receipt fields stay disabled until that intent is resolved.

Printing uses the browser's current order/quote view. No automated message delivery, payment collection or legal-tax invoice certification is implied. The displayed tax note comes from the server.
