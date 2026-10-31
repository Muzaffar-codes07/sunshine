# Field module

Owner: **D3**. Status: **job creation, scheduling, crew assignment and private JOB file authorization implemented**; installation completion, dedicated photo/signature associations and time are planned.

`JobsService.ensureJob(tx, facts)` creates one job per confirmed order, in the confirming transaction. The job holds no copy of the customer, capacity or system type; they stay on the order and its accepted quote. The database only lets an order point at its own job.

`POST /api/v1/jobs/:id/schedule` sets the times and crew together, with `expectedVersion`, for SALES or ADMIN. Only a job that hasn't started can change. A removed technician stays as history. `GET /jobs` lists every job for SALES, ADMIN and WAREHOUSE. `GET /jobs/assigned` is a technician's own work. `GET /jobs/:id` returns a 404 to a technician who isn't on that job. The job's version also guards allocation, so a schedule change means reloading before allocating.

`JobFileAccessModule` supplies `FILE_RECORD_AUTHORIZER` to `FilesModule`, independently of the orchestration module to avoid a cycle. ADMIN and current assigned technicians can upload/attach on any non-COMPLETED job. ADMIN, SALES and current assigned technicians can download; WAREHOUSE, SUPPORT and unassigned technicians cannot. Assignment removal revokes even the original uploader's bound-file access. The caller transaction verifies the job/order backlink and accepted quote/enquiry/customer identity, holding a shared job lock so scheduling/status changes cannot cross the authorization check. All assignment writers must claim the job first, as scheduling does. TICKET contexts remain unavailable until D4 supplies its adapter.

Attachments authorize/claim Job before locking File, then recheck ownership/association under the file lock. An admin cannot claim someone else's orphan or move a bound file. No new route or schema is needed. A successful private upload is not an installation photo/signature acceptance or a completed job; those S03 gates remain pending, as do physical-device/UI acceptance and D4 cost integration.

Add controllers, services, shared contracts and domain tests here. Business rules belong in services; critical side effects share one transaction. See [roles](../../../../docs/team/roles.md) and [API contracts](../../../../docs/architecture/api-contracts.md).
