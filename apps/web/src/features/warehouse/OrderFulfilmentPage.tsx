import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { allocationListResponseSchema, deliverDispatchRequestSchema, dispatchResponseSchema, recordScanRequestSchema, type AllocationView, type OrderFulfilment } from '@sunshine/contracts';
import { DetailPattern, ListPattern, TimelinePattern } from '../../components/shared/patterns';
import { CommandFeedback } from '../../components/shared/CommandFeedback';
import { Field } from '../../components/ui/Field';
import { useStaffSession } from '../auth/session';
import { describeProblem, formatWhen, humanize, localToIso } from '../sales/queries';
import { checkInput, useAllocations, useDispatch, useFulfilment, useJob, useStockCommand, useUnit } from './queries';

type Dispatch = z.infer<typeof dispatchResponseSchema>['data'];

function Serial({ unitId }: { unitId: string | null }) {
  const unit = useUnit(unitId);
  if (!unitId) return <>Bulk</>;
  return <>{unit.data?.data.serial ?? (unit.isError ? 'Unavailable' : 'Loading…')}</>;
}

function Reserved({ order, allocations, dispatch }: { order: OrderFulfilment; allocations: AllocationView[]; dispatch: Dispatch | null }) {
  const scanned = new Set(dispatch?.scans.filter((scan) => scan.countsForDispatch).map((scan) => scan.unitId));
  const names = new Map(order.packing.map((line) => [line.quoteLineId, line.description]));
  return <ListPattern title="Reserved equipment"
    columns={[{ id: 'item', label: 'Component' }, { id: 'serial', label: 'Serial' }, { id: 'quantity', label: 'Quantity' }, { id: 'scan', label: 'Scan' }]}
    rows={allocations.map((row) => ({ id: row.id, cells: {
      item: row.source.kind === 'QUOTE_LINE' ? names.get(row.source.quoteLineId) ?? 'Component' : 'Repair part',
      serial: <Serial unitId={row.unitId} />, quantity: row.quantity,
      scan: !row.unitId ? 'Not needed' : !dispatch ? 'Waiting for dispatch' : scanned.has(row.unitId) ? 'Scanned' : 'Needs scan',
    } }))} />;
}

function PostDispatch({ dispatch }: { dispatch: Dispatch }) {
  const command = useStockCommand(dispatchResponseSchema);
  return <>
    <p>Every required unit is scanned. Posting takes the goods out of stock and records their cost.</p>
    <button type="button" disabled={command.busy || command.uncertain} onClick={() => command.run(`/dispatches/${dispatch.id}/dispatch`, { expectedVersion: dispatch.version })}>{command.busy ? 'Posting…' : 'Post dispatch'}</button>
    <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry} />
  </>;
}

const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Deliver({ dispatch }: { dispatch: Dispatch }) {
  const command = useStockCommand(dispatchResponseSchema);
  const [suggested] = useState(nowLocal);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = new FormData(event.currentTarget).get('deliveredAt');
    // The field only holds whole minutes, which could fall before a dispatch posted moments ago. Left as suggested, it means now.
    let deliveredAt = new Date().toISOString();
    if (entered !== suggested) { try { deliveredAt = localToIso(entered); } catch { deliveredAt = ''; } }
    const checked = checkInput(deliverDispatchRequestSchema, { expectedVersion: dispatch.version, deliveredAt }, { deliveredAt: 'Enter a valid date and time.' });
    if ('problem' in checked) { command.setProblem(checked.problem); return; }
    command.run(`/dispatches/${dispatch.id}/deliver`, checked.data);
  }
  return <section className="pattern-card"><h2>Delivery</h2>
    <p role="status">Left the warehouse on {formatWhen(dispatch.dispatchedAt)}.</p>
    <form onSubmit={submit} noValidate aria-busy={command.busy}>
      <fieldset disabled={command.busy || command.uncertain}>
        <legend>Handed over at the site</legend>
        <Field label="Delivered at (local time)" hint="This starts each unit's warranty, and can't be changed later." error={command.problem.fields.deliveredAt}>{(control) => <input {...control} name="deliveredAt" type="datetime-local" defaultValue={suggested} required />}</Field>
        <button type="submit">{command.busy ? 'Recording…' : 'Record delivery'}</button>
      </fieldset>
    </form>
    <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry} />
  </section>;
}

function Delivered({ dispatch }: { dispatch: Dispatch }) {
  return <section className="pattern-card"><h2>Delivered</h2>
    <p role="status">Delivered on {formatWhen(dispatch.deliveredAt)}.</p>
    <ListPattern title="Warranty cover" empty="No serial units on this order."
      columns={[{ id: 'serial', label: 'Serial' }, { id: 'cover', label: 'Cover' }, { id: 'from', label: 'From' }, { id: 'to', label: 'Until' }]}
      rows={dispatch.coverage.map((row) => ({ id: row.unitId, cells: {
        serial: <Serial unitId={row.unitId} />, cover: row.status === 'ACTIVE' ? row.policyName : 'No warranty terms on the quote',
        from: row.startDate ?? 'Not started', to: row.expiryDate ?? 'Not started',
      } }))} />
  </section>;
}

function ScanForm({ dispatch }: { dispatch: Dispatch }) {
  const input = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState('');
  const command = useStockCommand(dispatchResponseSchema, (result) => {
    const [last] = result.data.scans.slice(-1);
    setSaved(last ? `Recorded ${last.normalizedSerial}.` : 'Recorded.');
    if (input.current) input.current.value = '';
  });
  // A handheld scanner types wherever the focus is, so focus must come back once the form is enabled again. A refused
  // value stays selected, so the next scan replaces it.
  useEffect(() => { if (!command.busy && !command.uncertain) { input.current?.focus(); input.current?.select(); } }, [command.busy, command.uncertain]);
  const { required, done } = { required: dispatch.scanReadiness.requiredUnitIds.length, done: dispatch.scanReadiness.requiredUnitIds.length - dispatch.scanReadiness.missingUnitIds.length };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaved('');
    const checked = checkInput(recordScanRequestSchema, { rawValue: form.get('rawValue'), method: form.get('method') }, { rawValue: 'Scan or enter the serial number.' });
    if ('problem' in checked) { command.setProblem(checked.problem); return; }
    command.run(`/dispatches/${dispatch.id}/scans`, checked.data);
  }

  return <section className="pattern-card">
    <h2>Scan equipment</h2>
    <p role="status">{done} of {required} required units scanned.</p>
    {!dispatch.scanReadiness.reservationValid && <p role="alert">The reservation has changed. Check the stock before scanning.</p>}
    {dispatch.scanReadiness.complete
      ? <PostDispatch dispatch={dispatch} />
      : <form onSubmit={submit} noValidate aria-busy={command.busy}>
        <fieldset disabled={command.busy || command.uncertain}>
          <legend>Next unit</legend>
          <Field label="Serial number" hint="Scan with the handheld scanner, which submits by itself." error={command.problem.fields.rawValue}>{(control) => <input {...control} ref={input} name="rawValue" maxLength={512} autoComplete="off" autoFocus required />}</Field>
          <Field label="How it was entered" hint="Typed entries are recorded but never count as a scan." error={command.problem.fields.method}>{(control) => <select {...control} name="method" defaultValue="SCANNER"><option value="SCANNER">Scanner</option><option value="TYPED">Typed</option></select>}</Field>
          <button type="submit">{command.busy ? 'Recording…' : 'Record scan'}</button>
        </fieldset>
      </form>}
    {saved && <p role="status">{saved}</p>}
    <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry} />
    <TimelinePattern title="Scan history" events={dispatch.scans.map((scan) => ({
      id: scan.id, label: `${scan.normalizedSerial} · ${humanize(scan.method)}`, at: formatWhen(scan.recordedAt), detail: scan.countsForDispatch ? 'Counts as a scan' : 'Recorded only',
    }))} />
  </section>;
}

function Actions({ order, version, hasAllocations, dispatch }: { order: OrderFulfilment; version: number; hasAllocations: boolean; dispatch: Dispatch | null }) {
  const reserve = useStockCommand(allocationListResponseSchema);
  const prepare = useStockCommand(dispatchResponseSchema);
  if (!hasAllocations) {
    return <section className="pattern-card"><h2>Reserve stock</h2>
      <p>Reserves every component on this order, or none if anything is short.</p>
      <button type="button" disabled={reserve.busy || reserve.uncertain} onClick={() => reserve.run(`/orders/${order.id}/allocations`, { expectedVersion: version })}>{reserve.busy ? 'Reserving…' : 'Reserve all stock'}</button>
      <CommandFeedback problem={reserve.problem} uncertain={reserve.uncertain} busy={reserve.busy} onRetry={reserve.retry} />
    </section>;
  }
  if (!dispatch) {
    return <section className="pattern-card"><h2>Dispatch</h2>
      <button type="button" disabled={prepare.busy || prepare.uncertain} onClick={() => prepare.run(`/orders/${order.id}/dispatches`, { expectedVersion: version })}>{prepare.busy ? 'Preparing…' : 'Prepare dispatch'}</button>
      <CommandFeedback problem={prepare.problem} uncertain={prepare.uncertain} busy={prepare.busy} onRetry={prepare.retry} />
    </section>;
  }
  if (dispatch.status === 'DELIVERED') return <Delivered dispatch={dispatch} />;
  if (dispatch.status === 'DISPATCHED') return <Deliver dispatch={dispatch} />;
  return <ScanForm key={dispatch.id} dispatch={dispatch} />;
}

function Fulfilment({ id }: { id: string }) {
  const order = useFulfilment(id);
  const job = useJob(order.data?.data.jobId);
  const allocations = useAllocations(id);
  const dispatch = useDispatch(id);
  const failed = order.error ?? allocations.error ?? dispatch.error ?? job.error;
  const refetch = () => { void order.refetch(); void allocations.refetch(); void dispatch.refetch(); void job.refetch(); };
  if (failed) return <div role="alert"><p>{describeProblem(failed).message}</p><button type="button" onClick={refetch}>Retry</button></div>;
  if (!order.data || !allocations.data || dispatch.data === undefined || !job.data) return <p role="status">Loading order…</p>;
  const item = order.data.data, rows = allocations.data.data.filter((row) => row.status !== 'RELEASED');
  return <>
    <h1>{item.displayNumber}</h1>
    <DetailPattern title="Order" entries={[
      { id: 'confirmed', label: 'Confirmed', value: formatWhen(item.confirmedAt) },
      { id: 'payment', label: 'Payment', value: item.released ? 'Released after recorded payment' : 'Awaiting advance payment' },
      { id: 'job', label: 'Job status', value: humanize(job.data.data.status) },
    ]} />
    <Actions order={item} version={job.data.data.version} hasAllocations={rows.length > 0} dispatch={dispatch.data?.data ?? null} />
    {rows.length > 0
      ? <Reserved order={item} allocations={rows} dispatch={dispatch.data?.data ?? null} />
      : <ListPattern title="Packing requirements" columns={[{ id: 'item', label: 'Component' }, { id: 'quantity', label: 'Quantity' }]}
        rows={item.packing.map((line) => ({ id: line.id, cells: { item: line.description, quantity: line.quantity } }))} />}
    <p><Link to="/workspace/warehouse">Back to the warehouse</Link></p>
  </>;
}

export function OrderFulfilmentPage({ orderId }: { orderId?: string }) {
  const params = useParams(); const session = useStaffSession();
  const id = orderId ?? params.id;
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  if (!session.data || !['WAREHOUSE', 'ADMIN'].includes(session.data.role)) return <p role="alert">Your role cannot use the warehouse workspace.</p>;
  if (!z.uuid().safeParse(id).success) return <p role="alert">This isn't a valid order link. <Link to="/workspace/warehouse">Back to the warehouse</Link></p>;
  return <Fulfilment id={id!} />;
}
