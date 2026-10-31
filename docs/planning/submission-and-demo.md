# Release, submission and three-minute demonstration

**Current operator script:** use [the expanded runbook](demo-runbook.md) and [complete build plan](demo-build-plan.md). They replace the earlier compressed single-new-customer timing below. The short pitch introduces multiple prepared records honestly; the full evaluator path proves a new enquiry through all required scenes. No timed rehearsal has been performed yet.

## Requirement provenance

The [supplied video extraction](../requirements/organizer-video-deliverables.md) requires working project, own local relational DB, custom backend APIs, clean dynamic UI, whole-team Git contributions and presentation. It comes from a 2025 video. Specific current event fields/deadlines/hosting/video rules at `https://hackathon.odoo.com/hackathon/details/69159` could not be independently verified. Do not label assumptions as organizer rules. The user's latest direction is to ignore unverified wall-clock deadlines.

## Artifact owners

| Artifact | Owner | Target |
|---|---|---|
| Working connected project | All, D2 integrates | H20.75 |
| Whole-team Git contributions | Each member | Throughout |
| README/env/startup/release | D2 | H22 |
| Migrations and explicit demo seed | D3 coordinates | H20.75 |
| ERD / integrity explanation | D3 | H22 |
| API contracts and domain tests | Each backend owner | H20.75 |
| Timed whole-team demo | D4 coordinates; all speak | H22 |
| Portal fields/evaluator access | D2 verifies | H0 and H22 |
| Cloud URL/video link, if required | D2 hosting, D4 video | Before actual submission |

## Deployment and fallback

Primary: local Compose app + PostgreSQL + persistent private files. Apply committed migrations explicitly. Build/package while internet works; bundle fonts/assets. Never publish database ports or commit secrets. A server deployment can use the same composition if allowed; Vercel/remote BaaS is not the baseline.

Maintain a second laptop with the release, locked dependencies or prebuilt image, DB backup and matching uploads. Verify restore. If Docker fails, document native PostgreSQL/Node startup. If cloud/internet fails, use the working local application. Local operation is not offline browser synchronization.

## Current presentation and completion evidence

Use [the runbook](demo-runbook.md): a staged three-minute presentation with explicit prepared records and real writes; a longer evaluator walkthrough starts from a fresh enquiry and proves R1–R25. The earlier single-customer timing sketch is superseded. No rehearsal or phone test is claimed by this document.

Current job oracle: fully paid D goes from 12,600 contribution to −2,000 after a 14,600 covered inverter replacement; E's fully paid original job adds a 4,000 chargeable repair invoice with 2,000 actual cost. See the machine-checked [oracle](demo-seed-oracle.json) for job/portfolio/period/pay/CSV scopes. Runtime reports must derive values from posted records.

Before claiming ready: every mandatory traceability row has real endpoint/UI/test evidence; the release survives cold start/restore; actual device/scanner and safe export work; all four have their own commits and presentation parts; actual organizer submission fields are checked by D2. Keep unknown requirements distinct from recommendations.
