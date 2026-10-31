# Decision and assumption register

Current baseline, 31 October 2026. Product owner/organizer decisions are distinct from engineering defaults. Neither agent can approve implementation tasks on the owner's behalf.

| ID | Decision / assumption | Status and authority | Consequence / revisit trigger |
|---|---|---|---|
| ADR-01 | Solar selected | Owner selected in Bridge thread 6 | Wedding comparisons remain history, not active scope |
| ADR-02 | One frontend, three backend owners | Latest owner instruction | D1 UI; D2 platform/sales/finance; D3 inventory; D4 field/service/reports |
| ADR-03 | Local relational DB/custom APIs/no BaaS | Owner-required supplied video document | No Supabase/Firebase baseline; specific current event rules still need confirmation |
| ADR-04 | React/Vite/Nest/Prisma/PostgreSQL | Selected and scaffold-tested engineering decision | Familiar concepts but different Nest/Prisma majors from prior project; freeze lockfile |
| ADR-05 | Modular monolith, same-tx helpers | Engineering decision | No queues or distributed transactions for this build |
| ADR-06 | One company/warehouse | MVP assumption | Add tenancy/warehouse management only after core acceptance |
| ADR-07 | Receipts recorded manually | MVP assumption | No external payment gateway; real invoice/receipt persistence remains required |
| ADR-08 | Staff-recorded repair confirmation | MVP assumption allowed by unspecified mechanism | Save confirmer/channel/time; no false claim of customer login |
| ADR-09 | Delivery starts new-sale warranties | Explicit PDF requirement | Retried delivery cannot extend; commissioning remains separate |
| ADR-10 | Replacement continues remaining coverage unless policy says otherwise | Explicit provisional policy | Actual manufacturer/service terms must settle restart/continuation; do not silently grant new long coverage |
| ADR-11 | Queryable subsidy milestone checklist | Minimal PDF implementation | No government integration, guaranteed approval or legal eligibility claim |
| ADR-12 | Relative 24-hour budget, no unverified wall dates | Owner said ignore deadline | Real event constraints must still be checked by submission owner |
| ADR-13 | Honest staged short pitch plus full evaluator path | Reviewed engineering/presentation choice, rehearsal pending | Prepared records announced; no claim one customer completed physically in minutes |
| ADR-14 | Pre-tax synthetic worked examples | Demonstration assumption | Actual tax/subsidy law unverified; sample figures are not market pricing |
| ADR-15 | Source-code origin | Owner decision, 31 Oct | All code is written fresh for Sunshine; no source is copied from earlier projects. The team applies engineering principles it already knows |
| ADR-16 | Current repository visibility/history | Existing owner-pushed state; no change authorized/requested in this task | Do not alter visibility or rewrite history; owner controls any such decision |
| ADR-17 | Specific event submission fields/required hosting/video/Odoo framework | Unknown; event retrieval inaccessible | D2 verifies, labels recommended artifacts separately, does not invent requirements |
| ADR-18 | Available scanner/phone | Unknown physical resource | Choose and test at early hardware gate; typing is not successful scan proof |
| ADR-19 | Stock model | Owner decision, 31 Oct | Derived append-only ledger with one writer, not a stored balance. Rules are in the data model |

## Changes to decisions

An owner instruction takes precedence; update PRD/PDR/TRD, role/task ownership, contracts, tests and affected schedule together. Record the source and reason. A reviewer can identify a problem, but cannot change team roles, repo visibility or organizer rules by agreeing with another agent.

## Research limits

Product capability claims are mostly vendor descriptions; missing public detail is unknown. Published service pain does not prove software failure. No buyer interviews, paid-product trials or willingness-to-pay validation were conducted. The demo can prove implementation behavior after it is built, not market uniqueness or a guaranteed win.
