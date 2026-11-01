import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { serviceTicketResponseSchema, ticketListResponseSchema, ticketStatusSchema } from '@sunshine/contracts';
import { ListPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { apiGet } from '../../lib/api';
import { describeD4Error } from './d4-http';
import { ServiceWorkspacePage } from './ServiceWorkspacePage';
import { WarrantyPolicies } from './WarrantyPolicies';
import { TicketHistory } from './TicketHistory';

function SavedTicket({ id }: { id: string }) {
  const ticket = useQuery({ queryKey: ['service', 'ticket', id], retry: false,
    queryFn: ({ signal }) => apiGet(`/tickets/${id}`, serviceTicketResponseSchema, signal) });
  return <>
    <p><Link to="/workspace/service">Back to saved tickets</Link></p>
    <button disabled={ticket.isFetching} onClick={() => void ticket.refetch()}>Reload saved ticket</button>
    {ticket.isPending && <p role="status">Loading saved ticket…</p>}
    {ticket.error && <div role="alert"><p>{describeD4Error(ticket.error)}</p><button onClick={() => void ticket.refetch()}>Retry ticket</button></div>}
    {ticket.data && <ServiceWorkspacePage ticketCommandsEnabled key={`${id}:${ticket.data.data.version}`} initialTicket={ticket.data.data} />}
    {ticket.data && <TicketHistory id={id} />}
  </>;
}

function SavedTickets() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const tickets = useQuery({ queryKey: ['service', 'tickets', status, page], retry: false,
    queryFn: ({ signal }) => apiGet(`/tickets?${new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}) })}`, ticketListResponseSchema, signal) });
  const data = tickets.data?.data;
  return <section aria-label="Saved service tickets">
    <Field label="Ticket status">{(control) => <select {...control} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="">All statuses</option>{ticketStatusSchema.options.map(value => <option key={value} value={value}>{value}</option>)}
    </select>}</Field>
    <ListPattern title="Saved service tickets" loading={tickets.isPending} error={tickets.error ? describeD4Error(tickets.error) : undefined}
      onRetry={() => void tickets.refetch()} empty="No saved tickets match this filter."
      columns={[{ id: 'number', label: 'Ticket' }, { id: 'fault', label: 'Fault' }, { id: 'status', label: 'Status' }, { id: 'coverage', label: 'Saved coverage' }]}
      rows={(data?.items ?? []).map(ticket => ({ id: ticket.id, cells: {
        number: <Link to={`/workspace/service?ticket=${ticket.id}`}>{ticket.ticketNumber}</Link>, fault: ticket.faultDescription,
        status: ticket.status, coverage: ticket.assessmentSnapshot?.coverageStatus ?? 'Assessment required',
      } }))} />
    {data && data.total > data.pageSize && <nav className="pager" aria-label="Ticket pagination">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
      <button disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button>
    </nav>}
  </section>;
}

export function ServiceWorkspaceRoute() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const id = search.get('ticket');
  if (id && !z.uuid().safeParse(id).success) return <div role="alert"><h1>Invalid ticket link</h1><Link to="/workspace/service">Back to saved tickets</Link></div>;
  return id ? <SavedTicket id={id} /> : <><ServiceWorkspacePage ticketCommandsEnabled onTicketSaved={ticket => navigate(`/workspace/service?ticket=${ticket.id}`)} /><SavedTickets /><WarrantyPolicies /></>;
}
