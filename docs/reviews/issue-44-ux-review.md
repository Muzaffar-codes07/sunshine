# Issue #44 workspace focus and warehouse review

The original review used `main` at `74c2429`. This candidate now includes the Solar OS shell from #75 and ticket command lifecycle from #77 on `main` at `ffa3622`. The shell's sidebar, topbar, role-filtered navigation, route boundary and path-change scroll behavior are retained. The warehouse section controls remain within its current workspace layout.

## Findings addressed

- Selecting a saved service ticket changes the query string without changing the workspace path. The main region now receives focus for either change. Path changes still scroll to the top; selecting another ticket does not unexpectedly reset scroll.
- Warehouse section buttons expose a pressed state and a programmatic relationship to the changing, named content region. The controls are grouped as one warehouse section chooser.

## Acceptance still open

The Solar OS redesign in #75 themed all screens, but its own coverage matrix calls for a layout pass on CRM, projects, inventory, service and finance. This scoped change is not a final all-screen accessibility or mobile acceptance. Issue #44's per-screen state matrix, actual phone camera and physical scanner evidence, covered and chargeable repair scenes, service pay, subsidy actions and three whole-lifecycle demo rehearsals remain open. The [frontend acceptance report](issue-44-frontend-acceptance.md) records earlier production-browser and 360 px flows; the phone evidence is in separate PR #73 and reports the insecure-context camera limitation.
