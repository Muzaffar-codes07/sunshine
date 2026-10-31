# Issue #44 scope-preservation audit

Compared the original issue handoff, the pre-takeover #44/#53 descriptions, and their current descriptions. The takeover changes the remaining implementer/reviewer to Tuhin/Codex; it does not remove functionality or permit invented outcomes. Original contributor credit is retained.

| Original obligation | Current tracking |
|---|---|
| F01 shell, role UX, shared patterns/design consistency | #44 F01; final per-screen review remains open |
| F02 scan/photo/signature and real-phone proof | #44 F02/F05; simulated media is distinguished from hardware |
| F03/F04 sales, surveys, quote/BOM, orders, invoices/receipts | #44 F03/F04; persisted browser and real-API evidence retained |
| F05 stock/history/movements/audit, allocation/scan/dispatch/delivery | #44 F05; backend remains authoritative |
| F06 installation, warranty, tickets, decisions, replacement lineage and confirmed closure | #44 F06 and every #53 service gate; read/display completion is distinct from execution |
| F07 period filters, finance/profit, technician hours/pay, subsidy next actor/evidence and CSV | #44 F07; finance/queues complete in #69; pay, service and subsidy actions remain open |
| F08A/B/C real integration across domains | #44 F08; completed paths and remaining service/pay paths kept separate |
| F08P responsive/accessibility and F09 three timed narrated persisted demos | #44 F08/F09; not replaced by short automated tests |
| All-screen loading/empty/400/401/403/409/unavailable/retry acceptance | Restored explicitly as final acceptance; shared-pattern tests alone do not close this |
| PR/API handoff: base/head, interfaces/errors/contracts, stable actual demo IDs, tests/mobile evidence, consuming module/blocker | Restored explicitly in #44 and the service HANDOFF.md |
| No fake paid/covered/completed states; one retry key/body per intent; separate internal cost/customer charge | Retained as business/integration constraints |
| Review by named D1/D4 owners | Reframed as takeover verification at the user's instruction; review obligations remain, external-owner waiting does not |

The earlier issue rewrite condensed the detailed per-screen state matrix, cross-screen design review and PR/API handoff obligations into broader entries. They are restored explicitly rather than treated as deleted or completed. All #53 production activation requirements remain intact; the only completed addition is the evidenced reporting slice. No scope reduction was requested or assumed.
