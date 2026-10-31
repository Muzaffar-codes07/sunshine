# Reporting runtime

Tuhin/Codex is completing the remaining D1/D4 integration under the owner's takeover instruction. No approval from the previous owners is required to continue this work.

ADMIN sessions can read posted financial summaries, job contribution, operational queues, subsidy records and financial CSV. Authorization verifies the active user from the stored session; request headers and unverified `request.user` are not credentials. Sensitive responses are not cached.

`PersistedReportingSource` reads invoices and receipts separately in the repository's RepeatableRead transaction. Invoice occurrence is `postedAt`; receipt occurrence is `receivedAt`, with `createdAt` also bounded by the cutoff so later-entered historical receipts do not appear in earlier snapshots. Source IDs/customer/job links are checked, including ticket repair invoices. Rows are never joined into a multiplicative aggregate. Signed cost entries and full reversals are read once by the existing repository and summed in exact cents.

A completed installation is financially provisional while frozen labour costing is unavailable. Service jobs also remain provisional until billing/cost finalization is activated. Posted costs are actual posted amounts, not an assertion that all expected costs have been recorded. Payroll and its CSV return `REPORTING_TIME_SOURCE_UNAVAILABLE` until persisted approved time and frozen rates exist; there is no fabricated zero payroll.

`GET /reports/operations` exposes separately paged pending installations and open repairs. `jobsPage`, `ticketsPage` and `pageSize` are bounded shared-contract inputs. Both counts/lists use one database snapshot; these queues cover all current open work, independent of a period filter. The UI links each row to the existing authorized job/ticket detail.

`reporting-runtime.db.test.mjs` exercises production providers and real session roles against a disposable database: separate invoice/receipt totals, backdated occurrences versus recording cutoff, signed reversals, uppercase UUID, CSV/source equality, operations counts/bounds, missing job, revoked staff and explicit unavailable payroll. These do not activate service writes, replacements, warranty policies or unsupported accounting/refund commands.
