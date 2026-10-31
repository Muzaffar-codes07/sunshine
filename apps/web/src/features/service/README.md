# Service workspace

Issue #44 assigns this bounded D4-facing frontend slice to Bhanu for Nirmayi's UI review.

`ServiceWorkspacePage` provides typed serial lookup, a saved-ticket projection and prepared create/assess/resolve/confirm forms. The default export keeps all ticket writes disabled. The backend currently ignores the command replay key and has no ticket GET route, so a timed-out create could duplicate a ticket on retry. Set `ticketCommandsEnabled` only after server-side replay and persisted ticket retrieval are integrated and verified. `initialTicket` is a projection supplied by a future authorized reader or an isolated test; no browser storage is treated as authority.

Coverage, customer charges, policy dates and replacement IDs come from validated contracts. Repair billing/costs, replacement commands and ticket list/detail routes are still upstream requirements. The frontend does not fabricate those results.

The transport stays inside these D4 feature folders because the shared client currently drops `error.reasons`. It preserves 400 field errors, 401/403, 409 reason/next action, request ID, 503 and network/response errors. Shared `lib/api.ts` remains unchanged.

## Review without shell changes

After building contracts, run the web dev server and open `/test/d4-preview.html`. It renders both feature pages with the existing design patterns and uses the real `/api` proxy. Ticket writes stay disabled, and unavailable/unauthorized reads show an error. This HTML is not a production entry point.

`npm test -w @sunshine/web` typechecks the preview and runs model, server-rendered component and mocked HTTP tests. It does not certify persisted business scenarios or phone/browser interactions.

Nirmayi owns final routing, shared-shell changes, visual review, accessibility and mobile integration.
