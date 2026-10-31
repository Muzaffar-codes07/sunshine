import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { operationsReportSchema } from '@sunshine/contracts';
import { apiGet } from '../../lib/api';
import { ListPattern } from '../../components/shared/patterns';
import { describeD4Error } from '../service/d4-http';

export function OperationsReport() {
  const [jobsPage, setJobsPage] = useState(1), [ticketsPage, setTicketsPage] = useState(1);
  const report = useQuery({ queryKey: ['reports','operations',jobsPage,ticketsPage], retry: false,
    queryFn: ({ signal }) => apiGet(`/reports/operations?${new URLSearchParams({jobsPage:String(jobsPage),ticketsPage:String(ticketsPage)})}`, z.object({ data: operationsReportSchema }), signal) });
  const data = report.data?.data;
  const pager = (page: number, total: number, size: number, change: (value: number) => void, name: string) => total > size && <nav className="pager" aria-label={name}>
    <button disabled={page <= 1} onClick={() => change(page-1)}>Previous</button><span>Page {page} of {Math.ceil(total/size)}</span><button disabled={page*size>=total} onClick={() => change(page+1)}>Next</button>
  </nav>;
  return <section aria-label="Open operational work"><h2>Open work across all dates</h2>
    {data && <p>{data.jobs.total} pending installations · {data.tickets.total} open repairs. Recorded as of {data.asOf}.</p>}
    <ListPattern title="Pending installations" loading={report.isPending} error={report.error ? describeD4Error(report.error) : undefined} onRetry={() => void report.refetch()}
      empty="No pending installations." columns={[{id:'job',label:'Job'},{id:'status',label:'Status'},{id:'date',label:'Scheduled'}]}
      rows={(data?.jobs.items ?? []).map(job => ({id:job.id,cells:{job:<Link to={`/workspace/field-service/jobs/${job.id}`}>{job.id}</Link>,status:job.status,date:job.scheduledStart ? new Date(job.scheduledStart).toLocaleString('en-IN') : 'Not scheduled'}}))} />
    {data && pager(jobsPage,data.jobs.total,data.jobs.pageSize,setJobsPage,'Pending installation pages')}
    <ListPattern title="Open repairs" loading={report.isPending} error={report.error ? describeD4Error(report.error) : undefined} onRetry={() => void report.refetch()}
      empty="No open repairs." columns={[{id:'ticket',label:'Ticket'},{id:'status',label:'Status'}]}
      rows={(data?.tickets.items ?? []).map(ticket => ({id:ticket.id,cells:{ticket:<Link to={`/workspace/service?ticket=${ticket.id}`}>{ticket.ticketNumber}</Link>,status:ticket.status}}))} />
    {data && pager(ticketsPage,data.tickets.total,data.tickets.pageSize,setTicketsPage,'Open repair pages')}
  </section>;
}
