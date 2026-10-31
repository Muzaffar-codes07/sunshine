# Frontend handoff — F01

Keep React/Vite, React Query, the shared Zod contracts, and the same-origin `/api` proxy. No backend changes are included in this slice.

## Routes

- `/`: public scaffold and live infrastructure checks.
- `/enquire`: public enquiry form.
- `/login`: staff cookie-session login.
- `/workspace`: authenticated overview, with Sales, Orders, Warehouse, Field & Service, and Reports navigation. Domain pages are explicitly planned placeholders.
- `/patterns`: development-only examples of the six shared patterns.
- F02 device spike remains separate; current main removed its earlier page, so this patch does not restore it.

Login calls `POST /auth/login`; session checks call `GET /auth/me`; logout calls `POST /auth/logout`, all through `/api/v1`. Credentials stay in the form/request and are not placed in localStorage. Roles come from the API; backend authorization remains authoritative. A session-check failure blocks the workspace and offers retry. An expired session redirects to login and preserves the workspace path. Login/logout clear cached data to avoid retaining another account's data.

## Verification

Use the root README setup, Node 22.12+, PostgreSQL, migrations and explicitly seeded staff accounts. Do not introduce a role picker or demo login bypass.

Frontend build: `npm run build -w @sunshine/web`.

Manual integration checks with the real API:

1. Visit `/workspace/orders` signed out; expect login, then return to Orders after valid login.
2. Reject blank/invalid credentials with readable errors; check incorrect credentials and rate limiting using API responses.
3. Refresh while signed in; confirm identity is restored from the server session.
4. Sign out; confirm workspace is inaccessible, including browser Back. Try another account and confirm cached data is cleared.
5. Revoke/expire the session; refocus the browser and confirm login is required.
6. Stop the API; confirm a retryable session error, without granting access.
7. At `/patterns`, open the action drawer by keyboard, verify focus stays in it, Escape closes it and focus returns to its trigger.

Local verification so far: TypeScript and production frontend build pass; browser checks verified empty-login validation, blocked workspace on unavailable API, and drawer initial focus/Escape/focus restoration. Real database-backed login/logout, session revocation, account switching, and the full responsive/accessibility pass still need verification.
