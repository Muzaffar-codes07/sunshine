# Independent review prompt: D4 Task 4.2

Copy the text below into another agent working in this repository.

```text
Review D4-plan.md Task 4.2 (S10), technician pay summary and injection-safe CSV,
in C:\Users\BHANU TEJA GUPTA V\Downloads\Projects\sunshine.
This is a read-only review. Do not modify, commit, push or reset any files.

Read AGENTS.md and follow Auric continuity with project sunshine and a unique
session ID. Verify saved context against current Git/files. Read README.md,
docs/team/roles.md, relevant TRD requirements and apps/api/src/reporting/README.md.
Task 4.1 was already implemented; assess the Task 4.2 additions and regressions.
Inspect git status/diff first; new untracked files must be reviewed too.
Ignore unrelated local .gitignore/.cursor/AGENTS changes and other tasks.

Scope:
- apps/api/src/reporting/csv-exporter.service.ts (new)
- reporting.service.ts, reporting-readers.ts, reporting.repository.ts,
  reporting.controller.ts, reporting.module.ts in the same directory
- packages/contracts/src/reports.ts
- apps/api/test/reporting-pay-csv.test.cjs (new), reporting.test.cjs
- packages/contracts/test/pay-export.test.cjs (new)
- reporting README, docs/architecture/api-contracts.md, Task 4.2 status in D4-plan.md

Check independently, including adversarial cases:
1. Approved installation/service time only, grouped by stable technician ID.
   Use each entry's frozen pay rate, never current staff rate. Exact integer
   milli-hours/cents, half-up rounding PER ENTRY then sums; mixed rates,
   fractional hours, zero rates, empty periods and aggregates beyond row precision.
   Ensure no duplicated entries or additional financial writes/double expense.
2. IST [start,end), Monday weeks, month/year/leap rollovers, server asOf for both
   work and approval, no pending/rejected/future/out-of-period inclusion.
   Malformed rows, bad dates/rates, null arrays, duplicate IDs and inconsistent
   technician identity must fail explicitly with structured errors.
3. RFC4180 quoting, escaped double quotes, commas, multiline fields, Unicode,
   final CRLF, consistent headers/columns and empty exports. Verify overview,
   single-job lifetime profitability and technician-pay exports reconcile to JSON.
   Check provisional/unfinished metadata and no unnecessary customer PII.
4. Formula text starting =,+,-,@, tabs/returns/newlines and triggers hidden behind
   spaces, Unicode whitespace or controls. Apostrophe neutralization must apply
   to text including '-1500.00', while typed negative loss/profit percentages
   remain numeric. Try crafted numeric wrappers; arbitrary expressions must fail.
5. GET /api/v1/reports/pay-summary and /reports/export.csv plus export-csv alias:
   ADMIN guard runs before reads, no forged header access, strict discriminated
   report filters, duplicate/unknown/mixed query rejection, required job ID for
   profitability, periods default today for pay/overview, no client rate/asOf.
   Validate actual streamed CSV bytes and text/csv UTF-8, fixed attachment name,
   no-store/nosniff headers, and JSON envelopes for failures before streaming.
6. Nest provider wiring and RepeatableRead tx propagation. Default missing auth
   and missing time source must fail 503, never fabricate data. TimeEntry models
   and verified auth are absent here: evaluate the honest adapter/gating design
   and record those as integration limitations, not newly introduced defects.
   Do not claim real DB acceptance from mocks. Existing Task4.1 gates remain.

Run npm.cmd run check and git diff --check. If an environment restriction blocks
a command, report the exact command/error and what remains unverified. Tests are
evidence, not proof: identify missing high-value cases and reason through code.

Return actionable findings first, ordered by severity. For each actual defect:
- severity and precise file:line
- concrete trigger/reproduction and observed vs expected behavior
- business/security impact
- exact minimal fix recommendation and a regression test that would catch it
Separate verified defects from optional improvements and upstream integration
gaps. Do not invent findings or recommend broad rewrites. If no defects are found,
say so explicitly, list checks run and residual limitations, and give a readiness
verdict distinguishing review-ready code from production integration readiness.
```
