# Quote snapshots and C5 handoff

Owner: D2. Quote content is frozen by the application at creation; a correction
creates a successor revision. The database also prevents changing sent/decided
terms, mutating their lines or deleting their history.

## Commands and reads

SALES and ADMIN sessions may use:

| Route | Behavior |
| --- | --- |
| POST /api/v1/enquiries/:id/quotes | Create the initial quote from surveyId and packageId |
| GET /api/v1/enquiries/:id/quotes | All revisions, newest first |
| GET /api/v1/quotes/:id | Frozen terms and whether this is the latest revision |
| POST /api/v1/quotes/:id/revise | version, surveyId, packageId and reason; inserts a successor |
| POST /api/v1/quotes/:id/send | version and channel; records manual sending |
| POST /api/v1/quotes/:id/accept | version, acceptedByName, channel and optional reference |
| POST /api/v1/quotes/:id/reject | version and reason |

Sending records an action staff already performed by EMAIL, WHATSAPP, PRINT or
OTHER. No message or document is sent by this endpoint. Acceptance is recorded
by authenticated staff with the customer name, channel and reference; it does
not imply the customer signed in. The server supplies actor IDs and timestamps.

Creation requires an open qualified enquiry, its latest approved survey, and a
current complete package. The customer/site, package revision, exact prices,
every component requirement and product/manufacturer/tracking/UOM facts are
saved. Clients cannot supply totals, component lines or policy facts.

One PACKAGE line charges hardware once. COMPONENT lines have zero price and
supply stock requirements; one SERVICE line charges installation. Money and
quantities are decimal strings. A complete On-Grid quote includes all nine
hardware categories; Off-Grid also includes a battery.

Every status command carries the last version. Commands and successor creation
lock the enquiry, check the latest revision and version, then change status or
insert all new facts in one transaction. Concurrent acceptance/revision has one
winner. Historical accepted and declined revisions stay readable.

## C5 confirmation

QuotesModule exports QuotesService. C5 calls
requireAcceptedQuote(tx, quoteId) inside its own transaction. The helper:

- locks the enquiry FOR SHARE so a successor cannot race confirmation;
- requires this to be the latest accepted quote;
- validates and returns the immutable quote DTO, including COMPONENT line UUIDs;
- uses the caller transaction and never commits independently.

C5 must create its order/invoice/job/packing effects in that same transaction,
with its own idempotent command and durable unique business sources. When the
Order model lands, C5 must also guard revisions after confirmation or enforce
one order per enquiry with an explicit correction path; a successor must not
quietly create another sale for an already confirmed installation.
Warehouse obligations reference COMPONENT quoteLine IDs and canonical product
IDs; they do not reuse PackageItem IDs or charge component retail prices again.
Stock units, acquisition costs, finance and actual coverage activation remain
their respective modules' responsibilities.

## Policy source

D4's agreed boundary is a database-only caller-transaction reader:
getWarrantyPolicySnapshot(tx, productId), returning policyName, revision, scope
and durationMonths, or null for explicitly unconfigured terms.

The injection token and interface live in quote-policy.port.ts. The D4 source
and helper are not implemented or wired yet. Current production quote lines
therefore save policyStatus UNCONFIGURED and a null snapshot for product lines;
the package charge is NOT_APPLICABLE. This makes no coverage promise.
D4 can wire its provider into QuotesModule through QUOTE_WARRANTY_POLICY_READER.
A reader error or invalid policy response aborts creation.

Configured terms, once available, are saved in full per product line. Delivery
must activate these frozen terms and must never select a newer policy silently.
A later policy change requires an explicit quote revision.

## Database verification

Migration 20261031170000_quotes applies atomically in one transaction and adds Quote and QuoteLine with real FKs to the
existing enquiry, survey, package, customer, user and product tables. Sixteen
CHECKs and three partial unique indexes cover amounts, evidence, revision links,
quantities, component zero charges and one package/service charge.

Two trigger functions preserve sent/decided facts and enforce complete terms
before sending, including the battery distinction. They reject direct SQL
mutations as well as API mistakes. Trigger rules are verified by real database
tests; pg_constraint does not expose them to the canonical constraint manifest.
