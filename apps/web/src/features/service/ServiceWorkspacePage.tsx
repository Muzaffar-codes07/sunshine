import { useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import { z } from 'zod';
import {
  assessTicketInputSchema,
  confirmTicketInputSchema,
  createTicketInputSchema,
  resolveTicketInputSchema,
  ticketListQuerySchema,
  ticketStatusSchema,
  warrantyLookupQuerySchema,
  type ServiceTicket,
  type TicketListQuery,
  type TicketStatus,
  type TicketListResponse,
  type WarrantyLookupResponse,
} from '@sunshine/contracts';
import { DetailPattern, FormPattern, ListPattern, TimelinePattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { newIdempotencyKey } from '../../lib/api';
import { D4RequestError, describeD4Error } from './d4-http';
import { assessTicket, confirmTicket, createTicket, getTicket, listTickets, lookupWarranty, resolveTicket } from './service-api';
import { coverageLabel, nextTicketAction, warrantyPeriod } from './service-model';

type FormFailure = { message: string; fields: Record<string, string[]> };
type CommandKey = { fingerprint: string; key: string };

function failure(error: unknown): FormFailure {
  return { message: describeD4Error(error), fields: error instanceof D4RequestError ? error.fieldErrors : {} };
}

function localNow(): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function commandKey(cache: MutableRefObject<CommandKey | null>, action: string, body: unknown): string {
  const fingerprint = `${action}:${JSON.stringify(body)}`;
  if (cache.current?.fingerprint === fingerprint) return cache.current.key;
  const key = newIdempotencyKey();
  cache.current = { fingerprint, key };
  return key;
}

// Enable only once the backend provides persisted ticket reads and command replay.
export function ServiceWorkspacePage({ ticketCommandsEnabled = false, initialTicket = null }: {
  ticketCommandsEnabled?: boolean; initialTicket?: ServiceTicket | null;
} = {}) {
  const [lookup, setLookup] = useState<WarrantyLookupResponse['data'] | null>(null);
  const [lookupFailure, setLookupFailure] = useState<FormFailure | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [ticket, setTicket] = useState<ServiceTicket | null>(initialTicket);
  const [ticketId, setTicketId] = useState(initialTicket?.id ?? '');
  const [readFailure, setReadFailure] = useState<FormFailure | null>(null);
  const [readPending, setReadPending] = useState(false);
  const [ticketList, setTicketList] = useState<TicketListResponse['data'] | null>(null);
  const [listUnitId, setListUnitId] = useState('');
  const [listStatus, setListStatus] = useState<TicketStatus | ''>('');
  const [listFailure, setListFailure] = useState<FormFailure | null>(null);
  const [listPending, setListPending] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [ticketFailure, setTicketFailure] = useState<FormFailure | null>(null);
  const [ticketPending, setTicketPending] = useState(false);
  const keyCache = useRef<CommandKey | null>(null);
  const commandPending = useRef(false);
  const lookupInFlight = useRef(false);
  const readInFlight = useRef(false);
  const listInFlight = useRef(false);

  async function submitRead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readInFlight.current || commandPending.current) return;
    const parsed = z.uuid().safeParse(ticketId.trim());
    setReadFailure(null);
    if (!parsed.success) {
      setReadFailure({ message: 'Enter a valid ticket ID.', fields: { ticketId: ['Enter a valid ticket ID.'] } });
      return;
    }
    await loadTicket(parsed.data);
  }

  async function loadTicket(id: string) {
    if (readInFlight.current || commandPending.current) return;
    readInFlight.current = true;
    setReadPending(true);
    setTicketId(id);
    setTicket(null);
    keyCache.current = null;
    try { setTicket((await getTicket(id)).data); }
    catch (error) { setReadFailure(failure(error)); }
    finally { setReadPending(false); readInFlight.current = false; }
  }

  async function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (listInFlight.current || commandPending.current) return;
    const parsed = ticketListQuerySchema.safeParse({
      page: 1, pageSize: 20, unitId: listUnitId.trim() || undefined, status: listStatus || undefined,
    });
    setListFailure(null);
    if (!parsed.success) {
      setListFailure({ message: 'Check the saved-ticket filters.', fields: zodFields(parsed.error.issues) });
      return;
    }
    await loadTicketList(parsed.data);
  }

  async function loadTicketList(query: TicketListQuery) {
    if (listInFlight.current || commandPending.current) return;
    listInFlight.current = true;
    setListPending(true);
    try { setTicketList((await listTickets(query)).data); }
    catch (error) { setListFailure(failure(error)); setTicketList(null); }
    finally { setListPending(false); listInFlight.current = false; }
  }

  function retryList() {
    const parsed = ticketListQuerySchema.safeParse({
      page: 1, pageSize: 20, unitId: listUnitId.trim() || undefined, status: listStatus || undefined,
    });
    if (parsed.success) void loadTicketList(parsed.data);
  }

  function openListedTicket(id: string) {
    setReadFailure(null);
    void loadTicket(id);
  }

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lookupInFlight.current) return;
    const values = new FormData(event.currentTarget);
    const parsed = warrantyLookupQuerySchema.safeParse({
      serial: values.get('serial'),
      manufacturerId: values.get('manufacturerId') || undefined,
      productId: values.get('productId') || undefined,
    });
    setLookupFailure(null);
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (fields[String(issue.path[0])] ??= []).push(issue.message);
      setLookupFailure({ message: 'Check the lookup fields.', fields });
      return;
    }
    lookupInFlight.current = true;
    setLookupPending(true); setLookup(null);
    try {
      const data = (await lookupWarranty(parsed.data)).data;
      setLookup(data); setUnitId(data.unit.id);
    }
    catch (error) { setLookupFailure(failure(error)); setLookup(null); }
    finally { setLookupPending(false); lookupInFlight.current = false; }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const parsed = createTicketInputSchema.safeParse({ unitId: values.get('unitId'), faultDescription: values.get('faultDescription') });
    if (!parsed.success) return setTicketFailure({ message: 'Check the ticket fields.', fields: zodFields(parsed.error.issues) });
    await runCommand('create', parsed.data, (key) => createTicket(parsed.data, key));
  }

  async function submitAssess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ticket) return;
    const values = new FormData(event.currentTarget);
    const instant = new Date(String(values.get('asOfDate')));
    const parsed = assessTicketInputSchema.safeParse({
      version: ticket.version,
      asOfDate: Number.isFinite(instant.getTime()) ? instant.toISOString() : '',
      requestedScope: values.get('requestedScope'),
    });
    if (!parsed.success) return setTicketFailure({ message: 'Check the assessment fields.', fields: zodFields(parsed.error.issues) });
    await runCommand('assess', parsed.data, (key) => assessTicket(ticket.id, parsed.data, key));
  }

  async function submitResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ticket) return;
    const values = new FormData(event.currentTarget);
    const parsed = resolveTicketInputSchema.safeParse({ version: ticket.version, resolutionDetails: values.get('resolutionDetails') });
    if (!parsed.success) return setTicketFailure({ message: 'Check the resolution fields.', fields: zodFields(parsed.error.issues) });
    await runCommand('resolve', parsed.data, (key) => resolveTicket(ticket.id, parsed.data, key));
  }

  async function submitConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ticket) return;
    const values = new FormData(event.currentTarget);
    const instant = new Date(String(values.get('confirmedAt')));
    const parsed = confirmTicketInputSchema.safeParse({
      version: ticket.version,
      confirmerName: values.get('confirmerName'),
      channel: values.get('channel'),
      confirmedAt: Number.isFinite(instant.getTime()) ? instant.toISOString() : '',
      notes: values.get('notes') || undefined,
    });
    if (!parsed.success) return setTicketFailure({ message: 'Check the confirmation fields.', fields: zodFields(parsed.error.issues) });
    await runCommand('confirm', parsed.data, (key) => confirmTicket(ticket.id, parsed.data, key));
  }

  async function runCommand(action: string, body: unknown, request: (key: string) => Promise<{ data: ServiceTicket }>) {
    if (!ticketCommandsEnabled || commandPending.current || readInFlight.current) return;
    commandPending.current = true;
    setTicketFailure(null); setTicketPending(true);
    try {
      const response = await request(commandKey(keyCache, action, body));
      setTicket(response.data); setTicketId(response.data.id); keyCache.current = null;
    } catch (error) { setTicketFailure(failure(error)); }
    finally { setTicketPending(false); commandPending.current = false; }
  }

  const action = ticket ? nextTicketAction(ticket.status) : null;
  return <section aria-labelledby="service-workspace-title">
    <h1 id="service-workspace-title">Warranty &amp; Service</h1>
    <p>Look up equipment coverage and its policy dates before discussing repair work.</p>

    <FormPattern title="Warranty lookup" submitLabel="Look up serial" pending={lookupPending}
      error={lookupFailure?.message} onSubmit={(event) => void submitLookup(event)}>
      <Field label="Serial number" error={lookupFailure?.fields.serial?.[0]}>
        {(control) => <input {...control} name="serial" autoComplete="off" required />}
      </Field>
      <Field label="Manufacturer ID (optional)" hint="Use when serials are ambiguous." error={lookupFailure?.fields.manufacturerId?.[0]}>
        {(control) => <input {...control} name="manufacturerId" autoComplete="off" />}
      </Field>
      <Field label="Product ID (optional)" hint="Use when serials are ambiguous." error={lookupFailure?.fields.productId?.[0]}>
        {(control) => <input {...control} name="productId" autoComplete="off" />}
      </Field>
    </FormPattern>

    {lookup && <DetailPattern title={`Warranty — ${lookup.unit.serial}`} entries={[
      { id: 'customer', label: 'Customer', value: lookup.customer?.name ?? 'Not installed' },
      { id: 'job', label: 'Job', value: lookup.job?.id ?? 'Not installed' },
      { id: 'status', label: 'Coverage', value: lookup.assessment.coverageStatus },
      { id: 'charge', label: 'Customer charge', value: lookup.assessment.customerCharge === null ? 'Pending repair assessment' : `₹${lookup.assessment.customerCharge}` },
      { id: 'period', label: 'Warranty period', value: warrantyPeriod(lookup.assessment) },
      { id: 'reason', label: 'Saved reason', value: lookup.assessment.reason },
    ]} />}

    <FormPattern title="Saved service ticket" submitLabel={ticket ? 'Refresh ticket' : 'Load ticket'} pending={readPending}
      error={readFailure?.message} onSubmit={(event) => void submitRead(event)}>
      <Field label="Ticket ID" error={readFailure?.fields.ticketId?.[0]}>
        {(control) => <input {...control} name="ticketId" value={ticketId} onChange={(event) => setTicketId(event.target.value)} autoComplete="off" required />}
      </Field>
    </FormPattern>

    <FormPattern title="Saved tickets" submitLabel="Load saved tickets" pending={listPending}
      error={listFailure?.message} onSubmit={(event) => void submitList(event)}>
      <Field label="Installed unit ID (optional)" hint="Leave blank to browse all tickets you can access." error={listFailure?.fields.unitId?.[0]}>
        {(control) => <input {...control} name="listUnitId" value={listUnitId} onChange={(event) => setListUnitId(event.target.value)} autoComplete="off" />}
      </Field>
      <Field label="Status (optional)" error={listFailure?.fields.status?.[0]}>
        {(control) => <select {...control} name="listStatus" value={listStatus} onChange={(event) => {
          const value = event.target.value;
          if (!value) { setListStatus(''); return; }
          const parsed = ticketStatusSchema.safeParse(value);
          if (parsed.success) setListStatus(parsed.data);
        }}>
          <option value="">All statuses</option><option value="OPEN">Open</option><option value="ASSESSED">Assessed</option>
          <option value="IN_PROGRESS">In progress</option><option value="AWAITING_CUSTOMER_CONFIRMATION">Awaiting customer confirmation</option><option value="CLOSED">Closed</option>
        </select>}
      </Field>
    </FormPattern>
    {(ticketList || listPending || listFailure) && <ListPattern title="Saved tickets" loading={listPending}
      error={listFailure?.message} onRetry={retryList} empty="No saved tickets match these filters."
      columns={[{ id: 'number', label: 'Ticket' }, { id: 'status', label: 'Status' }, { id: 'unit', label: 'Unit' }, { id: 'updated', label: 'Updated' }, { id: 'open', label: 'Detail' }]}
      rows={(ticketList?.items ?? []).map((row) => ({ id: row.id, cells: {
        number: row.ticketNumber, status: row.status, unit: row.unitId, updated: row.updatedAt,
        open: <button type="button" onClick={() => openListedTicket(row.id)}>Open ticket</button>,
      } }))} />}
    {ticketList && <p role="status">Showing {ticketList.items.length} of {ticketList.total} saved tickets.</p>}

    {!ticketCommandsEnabled && <p role="status">Ticket commands remain unavailable until server replay and billing are connected. Saved-ticket reads can also be unavailable while their production adapter is pending.</p>}
    <fieldset disabled={!ticketCommandsEnabled} style={{ border: 0, padding: 0, minWidth: 0 }}>
    <legend>Service ticket actions</legend>
    {!ticket && <FormPattern title="Create service ticket" submitLabel="Create ticket" pending={ticketPending}
      error={ticketFailure?.message} onSubmit={(event) => void submitCreate(event)}>
      <Field label="Installed unit ID" error={ticketFailure?.fields.unitId?.[0]}>
        {(control) => <input {...control} name="unitId" value={unitId} onChange={(event) => setUnitId(event.target.value)} required />}
      </Field>
      <Field label="Fault description" error={ticketFailure?.fields.faultDescription?.[0]}>
        {(control) => <textarea {...control} name="faultDescription" rows={4} required />}
      </Field>
    </FormPattern>}

    {ticket && <>
      <DetailPattern title={`Ticket ${ticket.ticketNumber}`} entries={[
        { id: 'status', label: 'Status', value: ticket.status },
        { id: 'version', label: 'Version', value: ticket.version },
        { id: 'customer', label: 'Customer ID', value: ticket.customerId },
        { id: 'job', label: 'Job ID', value: ticket.jobId },
        { id: 'coverage', label: 'Coverage decision', value: coverageLabel(ticket.assessmentSnapshot) },
        { id: 'reason', label: 'Coverage reason', value: ticket.assessmentSnapshot?.reason ?? 'Assessment required' },
        { id: 'old-unit', label: 'Replaced unit', value: ticket.replacedUnitId ?? 'No replacement recorded' },
        { id: 'new-unit', label: 'New unit', value: ticket.newUnitId ?? 'No replacement recorded' },
      ]} />
      <TimelinePattern title="Ticket timeline" events={ticketEvents(ticket)} />
      {action === 'ASSESS' && <FormPattern title="Assess coverage" submitLabel="Save assessment" pending={ticketPending}
        error={ticketFailure?.message} onSubmit={(event) => void submitAssess(event)}>
        <Field label="Assessment time (device local time)" error={ticketFailure?.fields.asOfDate?.[0]}>{(control) => <input {...control} name="asOfDate" type="datetime-local" defaultValue={localNow()} required />}</Field>
        <Field label="Requested scope" hint="For example: inverter repair." error={ticketFailure?.fields.requestedScope?.[0]}>{(control) => <input {...control} name="requestedScope" required />}</Field>
      </FormPattern>}
      {action === 'RESOLVE' && <FormPattern title="Record resolution" submitLabel="Await customer confirmation" pending={ticketPending}
        error={ticketFailure?.message} onSubmit={(event) => void submitResolve(event)}>
        <Field label="Resolution details" error={ticketFailure?.fields.resolutionDetails?.[0]}>{(control) => <textarea {...control} name="resolutionDetails" rows={4} required />}</Field>
      </FormPattern>}
      {action === 'CONFIRM' && <FormPattern title="Customer confirmation" submitLabel="Close ticket" pending={ticketPending}
        error={ticketFailure?.message} onSubmit={(event) => void submitConfirm(event)}>
        <Field label="Confirmer name" error={ticketFailure?.fields.confirmerName?.[0]}>{(control) => <input {...control} name="confirmerName" required />}</Field>
        <Field label="Channel" error={ticketFailure?.fields.channel?.[0]}>{(control) => <select {...control} name="channel" defaultValue="PHONE"><option value="PHONE">Phone</option><option value="WHATSAPP">WhatsApp</option><option value="IN_PERSON">In person</option></select>}</Field>
        <Field label="Confirmed at (device local time)" error={ticketFailure?.fields.confirmedAt?.[0]}>{(control) => <input {...control} name="confirmedAt" type="datetime-local" defaultValue={localNow()} required />}</Field>
        <Field label="Notes (optional)" error={ticketFailure?.fields.notes?.[0]}>{(control) => <textarea {...control} name="notes" rows={3} />}</Field>
      </FormPattern>}
      {action === 'DONE' && <p role="status">Ticket closed with recorded customer confirmation.</p>}
    </>}
    </fieldset>
  </section>;
}

function zodFields(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) (fields[String(issue.path[0])] ??= []).push(issue.message);
  return fields;
}

function ticketEvents(ticket: ServiceTicket) {
  const events: { id: string; label: string; at: string; detail?: string }[] = [
    { id: 'created', label: 'Ticket created', at: ticket.createdAt, detail: ticket.faultDescription },
  ];
  if (ticket.assessmentSnapshot) events.push({ id: 'assessed', label: 'Coverage assessed', at: ticket.assessmentSnapshot.assessedAt, detail: ticket.assessmentSnapshot.reason });
  if (ticket.resolvedAt) events.push({ id: 'resolved', label: 'Resolution recorded', at: ticket.resolvedAt, detail: ticket.resolutionDetails ?? undefined });
  if (ticket.confirmation) events.push({ id: 'confirmed', label: `Customer confirmed by ${ticket.confirmation.channel}`, at: ticket.confirmation.confirmedAt, detail: ticket.confirmation.confirmerName });
  return events;
}
