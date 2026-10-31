# Field module

Owner: **D3**. Status: **job creation implemented**; scheduling, assignments, installation completion, evidence and time are planned.

`JobsService.ensureJob(tx, facts)` creates one job per confirmed order, in the confirming transaction. The job holds no copy of the customer, capacity or system type; they stay on the order and its accepted quote. The database only lets an order point at its own job.

Jobs, assignments, installation completion, evidence associations and time.

Add controllers, services, shared contracts and domain tests here. Business rules belong in services; critical side effects share one transaction. See [roles](../../../../docs/team/roles.md) and [API contracts](../../../../docs/architecture/api-contracts.md).
