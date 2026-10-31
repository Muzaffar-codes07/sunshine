# Documentation index and precedence

## Foundational documents

- [PRD — Product Requirements](PRD.md): product goals, users, R1–R25 scope, acceptance, unhappy paths and communication.
- [PDR — Product Design Requirements](PDR.md): navigation, workflows, UI patterns, mobile states and presentation design.
- [TRD — Technical Requirements](TRD.md): stack, boundaries, schema/transactions, security, dates/money, operations and technical acceptance.
- [Decision/assumption register](foundations/decisions-and-assumptions.md): authority, provisional defaults and external questions.
- [Delivery contract](foundations/delivery-contract.md): ready/code-ready/integrated done, ownership and evidence.

The consolidated [team product brief](requirements/product-requirements.md) complements the PRD: it summarizes module acceptance and shares the same PDF authority, stack and four-owner boundaries. The PRD adds requirement-level traceability; the PDR/TRD specify design and technical decisions.

These document the planned product. They do not turn the current scaffold into a completed application.

## Current implementation guidance

1. [Solar PDF](requirements/solar-problem-statement.pdf): authoritative functional brief.
2. [Supplied organizer-video document](requirements/organizer-video-deliverables.md): user-required local DB/custom API/no-BaaS constraints. It is a 2025 video extraction, not independently verified current event rules.
3. [Product requirements](requirements/product-requirements.md): consolidated team brief, MVP boundaries and module acceptance criteria; does not override the supplied problem statement.
4. [Roles](team/roles.md): **one frontend developer and three backend developers**, the latest owner decision.
5. [Architecture](architecture/README.md), [data model](architecture/data-model.md), [API contracts](architecture/api-contracts.md).
6. [Execution plan](planning/execution-plan.md), [testing](planning/testing.md), [submission and demo](planning/submission-and-demo.md).

## Full hackathon build and presentation package

- [Complete 16-section build plan](planning/demo-build-plan.md): implementation order, roles, gates, cuts and acceptance.
- [Ordered ticket backlog](planning/build-backlog.json): owner, focused hours, dependencies, requirements and concrete done conditions.
- [R1–R25 traceability](planning/requirements-traceability.csv): every required behavior, accountable owner and demonstration/evaluator proof.
- [Operator and evaluator runbook](planning/demo-runbook.md): honest three-minute staged presentation, full walkthrough, device setup, Q&A and recovery.
- [Financial/seed oracle](planning/demo-seed-oracle.json): synthetic expected values that actual future reports must calculate.
- [Technology comparison and reasoning](architecture/technology-decisions.md): choices and alternatives against the supplied deliverables.

`npm run check:plan` verifies effort/dependencies/coverage/arithmetic, not implementation or a performed rehearsal. All domain tickets remain planned.

## Research

- [Solar research folder](research/solar/README.md): current market shortlist, capability matrix, pain evidence, gaps, solutions and source register.
- [Research archive](research/history/README.md): the original independent proposals, critiques, comparison and architecture discussions. Retained for provenance; superseded for stack, ownership, scope and demo-time decisions.

## Scope and evidence

The scaffold implements infrastructure, not business workflows. Planned capabilities must not be described as tested functionality. Research is public desktop research, with no buyer interviews or hands-on competitor trials. Missing detail on a vendor page is unknown, not proof of absence.

The current official event page is `https://hackathon.odoo.com/hackathon/details/69159`. Its specific submission requirements could not be independently verified during planning. Do not invent mandatory hosting, video formats, evaluator access, deadlines, or a requirement to build on Odoo itself. The user asked to ignore unverified wall-clock deadlines; the schedule is relative 24 hours.
