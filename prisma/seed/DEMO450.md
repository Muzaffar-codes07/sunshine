# 450-customer demonstration dataset

The explicit `db:seed:demo` command imports the [agreed customer cohorts](../../docs/planning/demo-data-expansion-plan.md)
through an offline historical adapter. It leaves normal API date/approval checks
and SQL guards enabled. The legacy two-scenario `db:seed` entry point remains
separate; use the new command for the complete dataset.

All identities, transactions and evidence are synthetic. The roof asset is a
labeled layout illustration, and the acceptance asset says SAMPLE ONLY. They
are not a real customer's photo or signature. Historical serials have TYPED
provenance; a hardware scan still needs actual device acceptance. Prepared
warehouse case B has no valid scanner input yet, so the operator must scan
every required serialized item before dispatch can succeed.

## Local run

Use a dedicated, migrated PostgreSQL database and a private `.env.demo450.local`
file in the repository root. This filename is ignored by Git. Required settings:

```dotenv
DATABASE_URL=postgresql://YOUR_LOCAL_USER:YOUR_LOCAL_PASSWORD@127.0.0.1:55440/sunshine_demo450?schema=public
DEMO_DATABASE_NAME=sunshine_demo450
DEMO_DATABASE_DISPOSABLE=true
DEMO_STAFF_PASSWORD=REPLACE_WITH_A_UNIQUE_DEMO_PASSWORD
SESSION_SECRET=REPLACE_WITH_A_FRESH_RANDOM_SESSION_SECRET
AUTH_TRUSTED_ORIGINS=http://127.0.0.1:3001,http://localhost:3001
SESSION_COOKIE_SECURE=false
UPLOAD_DIR=var/demo450/final-uploads
PORT=3001
```

Use 12–200 characters for the local staff password and at least 32 random bytes
for the session secret. Never commit these settings. On this workspace a local
file is prepared with generated secrets; read that file privately for login.

Migrate the designated database explicitly with `db:deploy` and its
`DATABASE_URL`; migration never invokes the seed. Build the web application for
the release view. Then:

```bash
npm run db:seed:demo -- --preview
npm run db:seed:demo
npm run db:verify:demo
npm run demo:verify:http
npm run demo:450
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks npm.ps1.
The prepared local database runs in task-owned container `sunshine-demo450-db`
on loopback port 55440, with database name `sunshine_demo450`. If stopped, run
`docker start sunshine-demo450-db` before starting the application.
`demo:450` serves the built UI and APIs at http://127.0.0.1:3001. Stop another
task-owned API using that port before starting; do not terminate unrelated apps.
Sign in at http://127.0.0.1:3001/login and open `/workspace/sales`.
`demo:verify:http` starts a temporary API on an available loopback port, verifies
saved data and downloads, then stops that process. Results are saved in
`var/demo450/http-verification.json`.

Accounts are `admin@sunshine.test`, `sales@sunshine.test`,
`warehouse@sunshine.test`, `support@sunshine.test`, `technician@sunshine.test`
and `technician2@sunshine.test` through `technician6@sunshine.test`. All use the
private environment password. An existing matching account retains its password;
reruns do not reset credentials or reactivate disabled staff.

The initial import freezes today's IST date. `--anchor=YYYY-MM-DD` can set a
different past date on the first run. Reruns reuse the saved database anchor and
reject a changed explicit anchor. A preview without an anchor uses today's date
without connecting; it is a proposal, not a read of the existing dataset.

## Guarantees and verification

- Exactly 450 unique Customer rows, each with an enquiry. Supporting rows are
  additional. The starting history includes 270 surveys, 200 quotes, 145 orders,
  145 jobs/invoices, 60 completed jobs and 15 OPEN service tickets.
- Six technicians work in three crews, with non-overlapping imported time.
  Historical labour is approved through the actual rate/cost writer.
- The dedicated database must contain no unrelated customers. The seed never
  deletes rows, rewrites frozen facts or adopts an unrelated phone/serial.
- Stable import commands store the version, anchor and per-customer fingerprint.
  Each customer chain commits atomically. On failure that chain rolls back and
  its new private files are removed. Rerunning resumes finished imports, checks
  identity, and preserves normal workflow progress.
- A session advisory lock serializes CLI imports; ordinary application writers
  still rely on their normal locks, constraints and version checks. Rehearse
  imports before operating the UI, not during a judge's live session.
- `var/demo450/verification.json` contains actual per-table counts, stock
  integrity results, verified file count, intake/current warranty decisions,
  financial totals and an independent initial-dataset financial oracle.
  Reports contain no passwords, hashes of passwords or connection strings.
- D/E remain OPEN for real assessment. Parts consumption, physical replacement
  and service billing still have their existing production adapter gates. The
  data import does not claim those actions are implemented.

The full database regression test uses an empty **separate** database whose name
contains `test`. After migrations and API build, set `TEST_DATABASE_URL` and run
`npm run test:demo:db`. It forces a late completed-job failure, checks DB/file
rollback, resumes to 450, reruns without duplicates, preserves a progressed
enquiry and reads saved histories through production DTO readers. The ordinary
API unit suite includes manifest uniqueness, dates, crew intervals and CLI guards.

## Backup and restore

Before rehearsal, stop writes and save a PostgreSQL custom-format dump, the
matching `UPLOAD_DIR` tree and `verification.json` together. Credentials stay
outside that backup report. Restore the dump into a new migrated-compatible
demo database and restore its matching files, then run `db:verify:demo` against
that exact database/file root. A DB-only backup cannot restore private evidence.

The workspace's final prepared backup is stored under ignored
`var/demo450/backup-final/`. It includes the database dump, matching private
files and successful `restore-verification.json`. An earlier trial snapshot is
retained separately; use `backup-final` for this completed dataset.
Restore to a new database for verification; do not overwrite another database or
reset the live evaluator session. The seed is not a reset command: progressed
records remain progressed until a prepared snapshot is explicitly restored.
