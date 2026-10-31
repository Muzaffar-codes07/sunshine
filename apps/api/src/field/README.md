# Field module

Owner: **D3**. Status: **job creation, scheduling, crew assignment, installation start and completion implemented**; posting labour cost waits for D4's cost writer.

`JobsService.ensureJob(tx, facts)` creates one job per confirmed order, in the confirming transaction. The job holds no copy of the customer, capacity or system type; they stay on the order and its accepted quote. The database only lets an order point at its own job.

`POST /api/v1/jobs/:id/schedule` sets the times and crew together, with `expectedVersion`, for SALES or ADMIN. Only a job that hasn't started can change. A removed technician stays as history. `GET /jobs` lists every job for SALES, ADMIN and WAREHOUSE. `GET /jobs/assigned` is a technician's own work. `GET /jobs/:id` returns a 404 to a technician who isn't on that job. The job's version also guards allocation, so a schedule change means reloading before allocating.

Jobs, assignments, installation completion, evidence associations and time.

Add controllers, services, shared contracts and domain tests here. Business rules belong in services; critical side effects share one transaction. See [roles](../../../../docs/team/roles.md) and [API contracts](../../../../docs/architecture/api-contracts.md).

`POST /api/v1/jobs/:id/start` and `/complete` need an `Idempotency-Key` and `expectedVersion`, for a technician on the job or an ADMIN. Start needs a crew, a recorded payment and delivered equipment.

Completion needs the sold capacity, every check for the system type (`BATTERY` only off-grid), the job's saved start time, a non-future finish, time records for the crew, images for roof photos, and a separate signature file. Upload files with a `JOB` context, because a file with no context can only be attached by the person who uploaded it. Each file's bytes are verified before the transaction, and a refusal leaves the job as it was. A completed job and its evidence can't change, and the database enforces this.

Time records can't overlap for one technician, even across jobs. Their IDs are the durable source for D4's labour cost (`TIME_RECORD:<id>`), which isn't posted yet.

`job-file-access.ts` holds the job file rules agreed on #39. It stays in its own module so Files can use it without a module cycle. Ticket files stay closed until D4 supplies its own rules.


File attachment integration claims Job before File, then repeats ownership/association checks under the file lock. This avoids a lock cycle with installation completion and preserves one-record binding. The added `job-files.db.test.mjs` suite uses the production provider to cover every role/action, revoked uploader access, invalid source chains, rollback, concurrent binding and the Job-before-File race. D4 ticket access remains unavailable.
