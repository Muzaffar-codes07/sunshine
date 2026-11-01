import { useEffect, useId, useRef, type FormEventHandler, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Entry = { id: string; label: string; value: ReactNode };

export function ListPattern({ title, columns, rows, loading = false, error, onRetry, empty = 'No records yet.' }: {
  title: string; columns: { id: string; label: string }[];
  rows: { id: string; cells: Record<string, ReactNode> }[];
  loading?: boolean; error?: string; onRetry?: () => void; empty?: string;
}) {
  if (loading) return <p role="status">Loading {title.toLowerCase()}…</p>;
  if (error) return <div role="alert"><p>{error}</p>{onRetry && <button onClick={onRetry}>Retry</button>}</div>;
  if (!rows.length) return <p>{empty}</p>;
  return <div className="table-scroll"><table role="table"><caption>{title}</caption><thead role="rowgroup"><tr role="row">{columns.map((column) => <th key={column.id} role="columnheader" scope="col">{column.label}</th>)}</tr></thead><tbody role="rowgroup">{rows.map((row) => <tr key={row.id} role="row">{columns.map((column) => <td key={column.id} role="cell" data-label={column.label}>{row.cells[column.id]}</td>)}</tr>)}</tbody></table></div>;
}

/** One-tap filters, with the count on each so the choice is informed. */
export function FilterChips<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void }) {
  return <div className="chips" role="group" aria-label={label}>{options.map((option) => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}{option.count !== undefined && <b>{option.count}</b>}</button>)}</div>;
}

const STATUS_TONES: Record<string, string> = {
  COMPLETED: 'ok', PAID: 'ok', APPROVED: 'ok', DELIVERED: 'ok', INSTALLED: 'ok', ACTIVE: 'ok', RESOLVED: 'ok', CLOSED: 'ok', AVAILABLE: 'ok', QUALIFIED: 'ok',
  IN_PROGRESS: 'active', CONTACTED: 'active', DISPATCHED: 'active', SUBMITTED: 'active', ASSESSED: 'active', PARTIALLY_PAID: 'active', RESERVED: 'active',
  REJECTED: 'danger', DISQUALIFIED: 'danger', VOID: 'danger', QUARANTINED: 'danger', EXPIRED: 'danger', ARCHIVED: 'muted', DRAFT: 'muted', RELEASED: 'muted', RETURNED: 'muted',
};
/** Status in words, with colour as a second signal only. */
export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONES[status], text = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <span className={`status-pill${tone ? ` status-pill--${tone}` : ''}`}>{text}</span>;
}

/** Headline amounts with an optional paid-so-far bar. The figures come from the API; the bar is only their ratio. */
export function MoneyStrip({ items, progress }: { items: { id: string; label: string; value: string; strong?: boolean }[]; progress?: { label: string; percent: number } }) {
  return <section className="money-strip" aria-label="Amounts">
    <dl>{items.map((item) => <div key={item.id} className={item.strong ? 'is-strong' : undefined}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    {progress && <div className="money-bar" role="progressbar" aria-label={progress.label} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress.percent}%` }} /></div>}
  </section>;
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
  return <dialog className="action-drawer" ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="drawer-head"><h2 id={id}>{title}</h2><button type="button" className="drawer-close" aria-label="Close" onClick={onClose}><X size="1.125rem" aria-hidden="true" /></button></div>
    <div className="drawer-body">{children}</div>
  </dialog>;
}

export function SummaryPattern({ title, entries, note }: { title: string; entries: Entry[]; note?: ReactNode }) {
  return <DetailPattern title={title} entries={entries}>{note && <p>{note}</p>}</DetailPattern>;
}
