# Solar feature selection and latest role division

Published on 31 October 2026 at Tuhin’s request, following independent proposals, exchanged critiques and review in Bridge thread #6.

- [Merged 38-feature report](report.md): 20 sections, both reviewers’ weighted scores, final classifications, consolidation, technical analysis, proposed PRD/TRD addenda, acceptance tests and demonstration.
- [Latest role-division brief](../../team/role-division-brief.md): Claude’s brief separating Tuhin-confirmed component assignments, proposed cross-module handoffs and open decisions.

The confirmed structure is one frontend owner and three backend component owners. Each person may sketch a minimal UI prototype; D1 owns production frontend. The role brief supersedes earlier assignments in `docs/team/roles.md`, PRD/TRD, `docs/requirements/product-requirements.md` section 7, and the build backlog/plan. Those documents have not been rewritten; their schedules and owners require reconciliation before being used for the new division.

Publishing this research does not approve feature tasks, settle the stack discrepancy, or implement any feature. The report recommends explained readiness, cost variance and a bounded exception queue; Tuhin still decides scope. The file-upload owner, developer names, scanner/phone setup and optional second-person verification remain open. The repository still uses Vite/NestJS/Prisma, while the feature brief names Next.js/Drizzle; no stack migration was authorized or applied in this publication.

Only infrastructure exists in the application today. The report’s “NO SCHEMA CHANGE REQUIRED” statements compare upgrades with the planned domain schema, not the current User-only database. Timing and operational benefits remain unmeasured.
