# Role division brief

31 Oct 2026. **This replaces the ownership in `docs/team/roles.md`, section 7 of `docs/requirements/product-requirements.md`, and the owners in the task plan.** Those files haven't been rewritten yet.

Four developers: **one dedicated frontend developer and three backend developers with component-based ownership.** Names aren't assigned yet.

## Confirmed by Tuhin

Source: section 3 of his feature-selection brief.

| Developer | Owns |
|---|---|
| **D1: Frontend and UI/UX** | All user-facing pages, responsive layouts and navigation, the shared design system, forms and frontend validation, API integration, client-side server state, charts and dashboards, contextual actions, accessibility, frontend tests. **No backend APIs, schema changes, migrations or business logic** |
| **D2: CRM, Sales and Commercial backend** | Customer CRM and enquiries, roof surveys and approvals, solar package catalogue, quotation generation and revisions, BOM creation, order management, customer payment recording, commercial workflow automation, shared authentication and RBAC foundation |
| **D3: Inventory, Logistics and Field Operations backend** | Inventory, stock availability and allocation, serialized equipment, warehouse dispatch, technician scheduling, installation jobs and readiness, field work records, installation evidence, quality verification, commissioning evidence and operational status |
| **D4: Warranty, Service and Business Intelligence backend** | Equipment warranties, coverage verification, service complaints and tickets, equipment replacement history, preventive maintenance, finance and profitability, cost variance analysis, subsidy status reporting and commercial records, operational exception reporting, management analytics, cross-module integration testing |

**Shared coordination**

| Responsibility | Coordinator |
|---|---|
| Frontend architecture and design system | D1 |
| API standards, auth, shared request contracts | D2 |
| PostgreSQL schema conventions and migration coordination | D3 |
| Cross-module integration, E2E testing, local deployment | D4 |
| Feature-specific database entities and APIs | Owning backend developer |
| Shared schema and API contract review | D2, D3, D4 |
| Git collaboration and technical presentation | All four |

**Rules**

- D1 does frontend only, and every frontend requirement belongs to D1.
- D2, D3 and D4 own their components end to end, including database work, on one shared PostgreSQL database.
- Each feature has one primary backend owner. Cross-module work names its supporting owners.
- Don't give all integration and QA work to D4.
- Developers build independently against agreed interfaces.
- Backend boundaries may be adjusted if clearly justified. The one-frontend, three-backend structure doesn't change.

**UI workflow:** each person makes a light UI/UX prototype of just the parts they need, then the frontend person works from those.

## Proposed, not confirmed

From the feature-selection report. Tuhin hasn't approved these.

| Boundary | Proposal |
|---|---|
| Invoices and receipts | D2 owns the posting functions. D4's service flow calls them for chargeable repairs |
| Cost entries | D4 owns them. D3 and D4 post through one function with a unique source |
| Warranty activation | D4 owns it. D3 calls it inside the delivery transaction |
| Job creation | D3 owns it. D2 calls it at order confirmation |
| Replacement | D4 orchestrates. D3 provides stock functions |
| Project summary API | D2 |
| Readiness checks | D3, with facts from D2 and D4 |
| Exception queue | D4 combines; D2, D3 and D4 each own two rules |
| Integration testing | Each owner tests their own scene. D4 coordinates the harness |

## Still open

- Who is D1, D2, D3 and D4.
- Who owns file uploads. Not assigned; the report recommends D2.
- Which stack is approved. The feature brief says Next.js and Drizzle; the repo and TRD use Vite, NestJS and Prisma.
- Whether to keep the six-rule queue in the first build, and whether to require a second-person installation check.
- What scanner and phones the team has.
