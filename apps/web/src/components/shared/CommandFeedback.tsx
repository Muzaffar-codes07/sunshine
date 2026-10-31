import type { Problem } from '../../lib/command';

/** The refusal reasons, and a retry of the same request when the result wasn't confirmed. */
export function CommandFeedback({ problem, uncertain, busy, onRetry }: { problem: Problem; uncertain: boolean; busy: boolean; onRetry: () => void }) {
  return <>
    {problem.messages.length > 0 && <div role="alert" className="form-error">{problem.messages.map((message) => <p key={message}>{message}</p>)}</div>}
    {uncertain && <div role="alert">
      <p>The result hasn't been confirmed. Retry this same request, and it can only take effect once.</p>
      <button type="button" disabled={busy} onClick={onRetry}>{busy ? 'Checking…' : 'Retry this request'}</button>
    </div>}
  </>;
}
