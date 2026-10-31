# Field workspace

Owner: **D1**, built with D3. Status: **a technician's jobs, start and completion implemented**, using the device controls from `components/device`. Time and cost reporting, and service tickets, aren't here.

Files upload to the job as soon as they're chosen, so a lost connection only loses the current file. The upload list is kept in `sessionStorage` until the job completes, because the API has no list of a job's files yet. The server checks all the evidence again at completion; the screen only helps fill it in.

Use shared list/detail/form/status patterns and typed API contracts. Backend owners supply fixtures and attend integration slots. Do not duplicate business or financial rules in the browser.
