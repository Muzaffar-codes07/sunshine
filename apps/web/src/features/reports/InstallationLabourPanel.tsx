import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { approveInstallationTimeSchema, createTechnicianRateSchema, installationTimeListSchema, installationTimeResponseSchema,
  technicianRateResponseSchema, technicianRatesListSchema } from '@sunshine/contracts';
import { DetailPattern, ListPattern } from '../../components/shared/patterns';
import { CommandFeedback } from '../../components/shared/CommandFeedback';
import { Field } from '../../components/ui/Field';
import { apiGet } from '../../lib/api';
import { checkInput, useRetrySafeCommand } from '../../lib/command';
import { describeD4Error } from '../service/d4-http';

function TimeReview({ id, onHeld }: { id: string; onHeld: (value: boolean) => void }) {
  const client = useQueryClient();
  const time = useQuery({ queryKey: ['labour','time',id], retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => apiGet(`/time-entries/${id}`, installationTimeResponseSchema, signal) });
  const technicianId = time.data?.data.technicianId;
  const rates = useQuery({ queryKey: ['labour','rates',technicianId], enabled: !!technicianId, retry: false,
    queryFn: ({ signal }) => apiGet(`/technician-rates?technicianId=${technicianId}&pageSize=50`, technicianRatesListSchema, signal) });
  const refresh = ['labour'];
  const rateCommand = useRetrySafeCommand(technicianRateResponseSchema, refresh);
  const approve = useRetrySafeCommand(installationTimeResponseSchema, refresh, () => { void client.invalidateQueries({ queryKey: ['reports'] }); });
  const held = rateCommand.busy || rateCommand.uncertain || approve.busy || approve.uncertain;
  useEffect(() => { onHeld(held); }, [held, onHeld]);
  function createRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const checked = checkInput(createTechnicianRateSchema, { technicianId, hourlyRate: values.get('hourlyRate'), reference: values.get('reference') });
    if ('problem' in checked) return rateCommand.setProblem(checked.problem);
    onHeld(true); rateCommand.run('/technician-rates', checked.data);
  }
  function approveTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const checked = checkInput(approveInstallationTimeSchema, { rateRevisionId: values.get('rateRevisionId'), note: values.get('note') });
    if ('problem' in checked) return approve.setProblem(checked.problem);
    onHeld(true); approve.run(`/time-entries/${id}/approve`, checked.data);
  }
  const row = time.data?.data;
  return <section aria-label="Review installation time">
    {time.isPending && <p role="status">Loading time record…</p>}
    {time.error && <div role="alert"><p>{describeD4Error(time.error)}</p><button onClick={() => void time.refetch()}>Retry time record</button></div>}
    {row && <>
      <DetailPattern title="Recorded installation time" entries={[
        { id:'technician',label:'Technician',value:row.technicianName }, { id:'job',label:'Job',value:<Link to={`/workspace/field-service/jobs/${row.jobId}`}>{row.jobId}</Link> },
        { id:'start',label:'Started',value:row.startedAt }, { id:'finish',label:'Finished',value:row.finishedAt },
        { id:'status',label:'Approval',value:row.approval ? 'Approved and posted' : 'Pending rate approval' },
      ]} />
      {row.approval ? <DetailPattern title="Frozen labour cost" entries={[
        { id:'hours',label:'Hours (rounded for display)',value:row.approval.hours }, { id:'rate',label:'Frozen hourly rate',value:`₹${row.approval.hourlyRate}` },
        { id:'amount',label:'Approved pay and cost',value:`₹${row.approval.amount}` }, { id:'cost',label:'Posted cost source',value:row.approval.costEntryId },
        { id:'at',label:'Approved at',value:row.approval.approvedAt }, { id:'note',label:'Approval note',value:row.approval.note },
      ]} /> : <>
        <p>Pay uses the recorded milliseconds × the selected approved hourly rate, rounded once to cents. Displayed hours are rounded to 0.001 hour. No rate is assumed.</p>
        <form onSubmit={createRate} noValidate aria-busy={rateCommand.busy}>
          <fieldset disabled={held}><legend>Add an approved rate revision</legend>
            <Field label="Hourly rate (INR)" error={rateCommand.problem.fields.hourlyRate}>{control => <input {...control} name="hourlyRate" inputMode="decimal" required />}</Field>
            <Field label="Rate approval reference" hint="Record the agreed rate basis; explicitly explain a zero rate." error={rateCommand.problem.fields.reference}>{control => <textarea {...control} name="reference" minLength={5} maxLength={500} required />}</Field>
            <button type="submit">Save approved rate revision</button>
          </fieldset>
          <CommandFeedback {...rateCommand} onRetry={rateCommand.retry} />
        </form>
        {rates.isPending && <p role="status">Loading approved rate revisions…</p>}
        {rates.error && <div role="alert"><p>{describeD4Error(rates.error)}</p><button onClick={() => void rates.refetch()}>Retry rate revisions</button></div>}
        <form onSubmit={approveTime} noValidate aria-busy={approve.busy}>
          <fieldset disabled={held || row.jobStatus !== 'COMPLETED' || !rates.data?.data.items.length}><legend>Approve and post this time</legend>
            <Field label="Approved rate revision" error={approve.problem.fields.rateRevisionId}>{control => <select {...control} name="rateRevisionId" required defaultValue="">
              <option value="">Select a saved revision</option>{rates.data?.data.items.map(rate => <option key={rate.id} value={rate.id}>₹{rate.hourlyRate}/hour · {rate.reference} · {rate.createdAt}</option>)}
            </select>}</Field>
            <Field label="Time approval note" error={approve.problem.fields.note}>{control => <textarea {...control} name="note" minLength={5} maxLength={500} required />}</Field>
            <button type="submit">Approve time and post cost</button>
          </fieldset>
          <CommandFeedback {...approve} onRetry={approve.retry} />
        </form>
        {row.jobStatus !== 'COMPLETED' && <p>Customer acceptance must be recorded before this time can be approved.</p>}
        {rates.data && !rates.data.data.items.length && <p>No approved rate exists for this technician. Save the agreed terms above.</p>}
      </>}
      {!held && <button onClick={() => { onHeld(false); void time.refetch(); }}>Reload approval</button>}
    </>}
  </section>;
}

export function InstallationLabourPanel() {
  const [page,setPage] = useState(1), [status,setStatus] = useState('PENDING'), [selected,setSelected] = useState(''), [held,setHeld] = useState(false);
  const records = useQuery({ queryKey:['labour','list',status,page],retry:false, refetchOnWindowFocus:false, refetchOnReconnect:false,
    queryFn:({signal})=>apiGet(`/time-entries?status=${status}&page=${page}&pageSize=10`,installationTimeListSchema,signal) });
  const data=records.data?.data;
  return <section aria-labelledby="installation-labour-title"><h2 id="installation-labour-title">Installation time approval</h2>
    <p>Only approved installation time posts a labour cost. Service-time pay remains pending its own integration.</p>
    <Field label="Time approval status">{control=><select {...control} value={status} disabled={held} onChange={event=>{setStatus(event.target.value);setPage(1);}}>
      <option value="PENDING">Pending approval</option><option value="APPROVED">Approved</option><option value="ALL">All recorded installation time</option>
    </select>}</Field>
    <ListPattern title="Recorded installation time entries" loading={records.isPending} error={records.error ? describeD4Error(records.error) : undefined}
      onRetry={()=>void records.refetch()} empty="No installation time matches this filter."
      columns={[{id:'technician',label:'Technician'},{id:'job',label:'Job'},{id:'finish',label:'Finished'},{id:'approval',label:'Approval'},{id:'action',label:'Action'}]}
      rows={(data?.items??[]).map(row=>({id:row.id,cells:{technician:row.technicianName,job:row.jobId,finish:row.finishedAt,
        approval:row.approval ? `₹${row.approval.amount}` : 'Pending',action:<button disabled={held} onClick={()=>setSelected(row.id)}>Review time {row.id}</button>}}))} />
    {data && data.total>data.pageSize && <nav aria-label="Installation time pagination"><button disabled={held || page===1} onClick={()=>setPage(page-1)}>Previous time records</button>
      <span>Page {page}</span><button disabled={held || page*data.pageSize>=data.total} onClick={()=>setPage(page+1)}>Next time records</button></nav>}
    {selected && <TimeReview key={selected} id={selected} onHeld={setHeld} />}
  </section>;
}
