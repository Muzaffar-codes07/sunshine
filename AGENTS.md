# Sunshine workspace

## Auric continuity

Auric is available through the machine's MCP connection. Use the exact project ID
`sunshine` for this repository; keep session IDs unique to each working session.

- At the start of a session, call `get_session_context` and `get_resume_packet`
  for `sunshine` when Auric is available. Verify saved state against Git and files.
- Start a session with `update_session_state`, using project ID `sunshine`, a
  unique session ID, and the actual current intent and workflow state.
- Record material decisions with their reasoning through `log_decision`; use
  `track_open_loop` for concrete unfinished work.
- At meaningful milestones and before handing off, use `capture_workspace_state`
  to save verified Git state, active files, commands, blockers, and next action.
- End the session with `end_session` when the requested work is complete.
- Never store credentials, personal download links, license keys, or `.env`
  contents in Auric or in tracked files.
- If Auric is unavailable, continue the task and report the continuity gap.

## Project context

Read `README.md` and relevant documentation before implementation.
`docs/team/roles.md` defines ownership. Historical research is not implementation
guidance. Keep saved Auric context subordinate to current files and user requests.
