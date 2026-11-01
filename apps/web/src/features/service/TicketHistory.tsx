import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ticketHistoryResponseSchema } from '@sunshine/contracts';
import { TimelinePattern } from '../../components/shared/patterns';
import { apiGet } from '../../lib/api';
import { humanize } from '../sales/queries';
import { describeD4Error } from './d4-http';
export function TicketHistory({id}:{id:string}){
  const [page,setPage]=useState(1);
  const history=useQuery({queryKey:['service','history',id,page],retry:false,
    queryFn:({signal})=>apiGet(`/tickets/${id}/events?page=${page}&pageSize=20`,ticketHistoryResponseSchema,signal)});
  const data=history.data?.data;
  return <section aria-label="Audited service history">
    {history.isPending&&<p role="status">Loading audited service history…</p>}
    {history.error&&<div role="alert"><p>{describeD4Error(history.error)}</p><button onClick={()=>void history.refetch()}>Retry history</button></div>}
    {data&&<>
      {!data.items.length?<p>No audited events recorded for this historical ticket.</p>:<TimelinePattern title="Audited service history" events={data.items.map(row=>({
        id:row.id,at:row.occurredAt,label:`${row.fromStatus===row.status?`${humanize(row.status)}, updated`:`${row.fromStatus?humanize(row.fromStatus):'Intake'} → ${humanize(row.status)}`} · ${row.actor.name}`,
        detail:row.assessment&&(row.previousAssessment?.coverageStatus!==row.assessment.coverageStatus||row.previousAssessment?.requestedScope!==row.assessment.requestedScope)?`${row.previousAssessment?humanize(row.previousAssessment.coverageStatus):'No earlier verified decision'} → ${humanize(row.assessment.coverageStatus)}; requested scope: ${row.assessment.requestedScope}. ${row.assessment.reason}`:undefined,
      }))}/>}
      {data.total>data.pageSize&&<nav aria-label="Service history pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Newer history</button>
        <span>Page {page}</span><button disabled={page*data.pageSize>=data.total} onClick={()=>setPage(page+1)}>Older history</button></nav>}
    </>}
  </section>;
}
