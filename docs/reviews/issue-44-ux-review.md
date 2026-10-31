# Issue #44 takeover UX and accessibility review

Reviewed the production routes on `main` at `74c2429` for the F01 review item. The review covers the public enquiry and staff sign-in, the shared staff shell, and the sales, orders, warehouse, field, service and reports workspaces. It checks route access, headings and landmarks, keyboard focus, form labels and errors, loading/refusal/retry states, table semantics and the responsive rules. The existing [frontend acceptance report](issue-44-frontend-acceptance.md) records the production-browser and 360 px runs for the integrated flows.

## Findings addressed in this change

- The overview described report sources as pending after #69 connected posted financial reads. Its description now distinguishes live financial and queue reads from pay and subsidy work that remains open.
- Staff navigation moved focus to the content for path changes, but selecting a saved service ticket changes only the query string. Focus now follows that change so keyboard and screen-reader users reach the selected ticket.
- Warehouse section controls exposed a pressed state but no programmatic relationship to the changing content. They now form a named control group and point to a named content region. The selected state remains on the active button.

## Remaining acceptance

This review does not establish a physical phone, camera or scanner result. The F02 and F08P device checks in #44 remain open. Service writes, payroll, subsidy actions, covered/chargeable repair scenes and the whole-lifecycle rehearsals also remain open under #44 and #53. The #44 legend reserves checked boxes for implementation verified on `main`; this change is a review candidate until merged and checked there.
