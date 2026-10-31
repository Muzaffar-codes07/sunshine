import { useEffect, useId, useRef, type FormEventHandler, type ReactNode } from 'react';

type Entry = { id: string; label: string; value: ReactNode };

export function ListPattern({ title, columns, rows, loading = false, error, onRetry, empty = 'No records yet.' }: {
  title: string; columns: { id: string; label: string }[];
  rows: { id: string; cells: Record<string, ReactNode> }[];
  loading?: boolean; error?: string; onRetry?: () => void; empty?: string;
}) {
  if (loading) return <p role="status">Loading {title.toLowerCase()}…</p>;
  if (error) return <div role="alert"><p>{error}</p>{onRetry && <button onClick={onRetry}>Retry</button>}</div>;
  if (!rows.length) return <p>{empty}</p>;
  return <div className="table-scroll"><table><caption>{title}</caption><thead><tr>{columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.id}>{row.cells[column.id]}</td>)}</tr>)}</tbody></table></div>;
}

export function DetailPattern({ title, entries, children }: { title: string; entries: Entry[]; children?: ReactNode }) {
  return <section className="pattern-card"><h2>{title}</h2><dl className="detail-grid">{entries.map((entry) => <div key={entry.id}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>)}</dl>{children}</section>;
}

export function FormPattern({ title, onSubmit, pending = false, error, submitLabel, children }: {
  title: string; onSubmit: FormEventHandler<HTMLFormElement>; pending?: boolean;
  error?: string; submitLabel: string; children: ReactNode;
}) {
  return <form onSubmit={onSubmit} noValidate aria-busy={pending}><fieldset disabled={pending}><legend>{title}</legend>{children}<button type="submit">{pending ? 'Submitting…' : submitLabel}</button></fieldset>{error && <p className="form-error" role="alert">{error}</p>}</form>;
}

export function TimelinePattern({ title, events }: { title: string; events: { id: string; label: string; at: string; detail?: ReactNode }[] }) {
  return <section className="pattern-card"><h2>{title}</h2>{events.length ? <ol className="timeline">{events.map((event) => <li key={event.id}><strong>{event.label}</strong> <time dateTime={event.at}>{new Date(event.at).toLocaleString('en-IN')}</time>{event.detail && <p>{event.detail}</p>}</li>)}</ol> : <p>No activity recorded.</p>}</section>;
}

export function ActionDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog className="action-drawer" ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }}><h2 id={id}>{title}</h2><button type="button" onClick={onClose}>Close</button>{children}</dialog>;
}

export function SummaryPattern({ title, entries, note }: { title: string; entries: Entry[]; note?: ReactNode }) {
  return <DetailPattern title={title} entries={entries}>{note && <p>{note}</p>}</DetailPattern>;
}
