# Field module

Owner: **D3**. Status: **job creation, scheduling and crew assignment implemented**; installation completion, evidence and time are planned.

`JobsService.ensureJob(tx, facts)` creates one job per confirmed order, in the confirming transaction. The job holds no copy of the customer, capacity or system type; they stay on the order and its accepted quote. The database only lets an order point at its own job.

`POST /api/v1/jobs/:id/schedule` sets the times and crew together, with `expectedVersion`, for SALES or ADMIN. Only a job that hasn't started can change. A removed technician stays as history. `GET /jobs` lists every job for SALES, ADMIN and WAREHOUSE. `GET /jobs/assigned` is a technician's own work. `GET /jobs/:id` returns a 404 to a technician who isn't on that job. The job's version also guards allocation, so a schedule change means reloading before allocating.

Jobs, assignments, installation completion, evidence associations and time.

Add controllers, services, shared contracts and domain tests here. Business rules belong in services; critical side effects share one transaction. See [roles](../../../../docs/team/roles.md) and [API contracts](../../../../docs/architecture/api-contracts.md).
