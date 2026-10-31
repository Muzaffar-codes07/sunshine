# Release, submission and three-minute demonstration

## Requirement provenance

The [supplied video extraction](../requirements/organizer-video-deliverables.md) requires working project, own local relational DB, custom backend APIs, clean dynamic UI, whole-team Git contributions and presentation. It comes from a 2025 video. Specific current event fields/deadlines/hosting/video rules at `https://hackathon.odoo.com/hackathon/details/69159` could not be independently verified. Do not label assumptions as organizer rules. The user's latest direction is to ignore unverified wall-clock deadlines.

## Artifact owners

| Artifact | Owner | Target |
|---|---|---|
| Working connected project | All, D2 integrates | H18 |
| Whole-team Git contributions | Each member | Throughout |
| README/env/startup/release | D2 | H20 |
| Migrations and explicit demo seed | D3 coordinates | H18 |
| ERD / integrity explanation | D3 | H20 |
| API contracts and domain tests | Each backend owner | H18 |
| Timed whole-team demo | D4 coordinates; all speak | H21 |
| Portal fields/evaluator access | D2 verifies | H0 and H21 |
| Cloud URL/video link, if required | D2 hosting, D4 video | Before actual submission |

## Deployment and fallback

Primary: local Compose app + PostgreSQL + persistent private files. Apply committed migrations explicitly. Build/package while internet works; bundle fonts/assets. Never publish database ports or commit secrets. A server deployment can use the same composition if allowed; Vercel/remote BaaS is not the baseline.

Maintain a second laptop with the release, locked dependencies or prebuilt image, DB backup and matching uploads. Verify restore. If Docker fails, document native PostgreSQL/Node startup. If cloud/internet fails, use the working local application. Local operation is not offline browser synchronization.

## Demo data and accounts

Future implementation: separate real role-restricted staff browser profiles; barcode and photograph; no fake role switcher. Current scaffold has no accounts yet. New workflow records use today's dates. The warranty story uses a separately seeded historical installation delivered 18 months ago, clearly labeled. Never change production time.

| Time | Presenter / action | Visible persisted result |
|---|---|---|
| 0:00–0:15 | D1 public enquiry | Appears in sales queue |
| 0:15–0:35 | D2 qualify/approve survey | Quote creation enabled |
| 0:35–0:55 | D2 3 kW quote/order/advance | Frozen BOM, invoice balance, job/packing needs |
| 0:55–1:20 | D3 allocate/scan/dispatch/deliver | Customer serial linkage, stock change, warranty activation |
| 1:20–1:45 | D4 field form/photo/signature | Installation complete with evidence |
| 1:45–2:15 | D4 historical inverter fault | Correct saved coverage decision |
| 2:15–2:35 | D4 covered repair | Zero customer charge, actual internal cost |
| 2:35–3:00 | Customer confirmation/reports | Closed ticket, job margin and pending-work changes |

A retry uses idempotency; a prepared existing record is labeled as such. A recording is not a live recovery. API/stock/payment/evidence/report outcomes must persist and survive refresh. Test every critical command before presenting.
