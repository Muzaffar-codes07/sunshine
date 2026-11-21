# Sunshine workspace

## Auric continuity

Auric is available through the machine's MCP connection. Use the exact project ID
`sunshine` for this repository. Use one unique session ID for a substantive
working session, even when it spans multiple related requests. Do not create a
new Auric session for every prompt.

- At the start of substantive work that needs saved continuity, read
  `get_session_context` and `get_resume_packet` once for `sunshine`. Verify
  saved state against Git and files. Skip Auric for small, self-contained
  requests that do not need a handoff or saved context.
- Keep decisions, open loops, and verified workspace state in the working
  context while implementing. Do not call Auric for each request, decision,
  iteration, or routine milestone.
- At the end of a related work batch or before a handoff, make one consolidated
  Auric update. Call `update_session_state` once with the actual current intent
  and workflow state. Use `log_decision` only for material decisions, grouped
  with their reasoning; use `track_open_loop` only for concrete unfinished work.
  Call `capture_workspace_state` once with verified Git state, active files,
  commands, blockers, and next action. Omit calls that have no new information.
- Call `end_session` when that substantive working session is complete. Do not
  end and restart it between related requests.
- Never store credentials, personal download links, license keys, or `.env`
  contents in Auric or in tracked files.
- If Auric is unavailable, continue the task and report the continuity gap.

## Project context

Read `README.md` and relevant documentation before implementation.
`docs/team/roles.md` defines ownership. Historical research is not implementation
guidance. Keep saved Auric context subordinate to current files and user requests.
