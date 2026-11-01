import { describeProblem } from '../sales/queries';

export function PanelLoading({ lines = 3, label }: { lines?: number; label: string }) {
  return <div className="panel-loading" role="status" aria-label={label}>{Array.from({ length: lines }, (_, index) => <span key={index} className="skeleton" />)}</div>;
}

export function PanelError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <div className="panel-error" role="alert"><p>{describeProblem(error).message}</p><button type="button" onClick={onRetry}>Try again</button></div>;
}
