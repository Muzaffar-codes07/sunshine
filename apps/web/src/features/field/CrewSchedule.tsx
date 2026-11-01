import { useQuery } from '@tanstack/react-query';
import { jobResponseSchema, scheduleJobRequestSchema, type JobView } from '@sunshine/contracts';
import { DetailPattern, StatusPill } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { apiGet } from '../../lib/api';
import { CommandDrawer } from '../sales/CommandDrawer';
import { describeProblem, formatWhen, isoToLocal, localToIso, salesKeys, useStaff } from '../sales/queries';

const ORDERED = 'Scheduled finish must be after start';
const toIso = (value: FormDataEntryValue | null) => {
  try { return localToIso(value); } catch { return ''; }
};

/** Sets a job's times and crew. Keyed under the enquiry, so a saved change refreshes what the order page shows. */
export function CrewSchedule({ jobId, enquiryId }: { jobId: string; enquiryId: string }) {
  const job = useQuery({
    queryKey: [...salesKeys.enquiry(enquiryId), 'job', jobId],
    queryFn: ({ signal }) => apiGet(`/jobs/${jobId}`, jobResponseSchema, signal),
  });
  const technicians = useStaff('TECHNICIAN');
  if (job.isPending) return <p role="status">Loading crew schedule…</p>;
  if (job.error) return <div role="alert"><p>{describeProblem(job.error).message}</p><button type="button" onClick={() => void job.refetch()}>Retry</button></div>;
  const item = job.data.data;
  const names = new Map(technicians.data?.data.items.map((person) => [person.id, person.displayName]));
  return <DetailPattern title="Crew schedule" entries={[
    { id: 'status', label: 'Job status', value: <StatusPill status={item.status} /> },
    { id: 'start', label: 'Starts', value: item.scheduledStart ? formatWhen(item.scheduledStart) : 'Not scheduled' },
    { id: 'finish', label: 'Finishes', value: item.scheduledFinish ? formatWhen(item.scheduledFinish) : 'Not scheduled' },
    { id: 'crew', label: 'Crew', value: item.technicianIds.map((id) => names.get(id) ?? 'Former technician').join(', ') || 'None assigned' },
  ]}>
    {item.status === 'SCHEDULED'
      ? <ScheduleForm job={item} enquiryId={enquiryId} people={technicians.data?.data.items ?? []} />
      : <p>This job has started, so its schedule and crew are fixed.</p>}
    {technicians.error && <p role="alert">{describeProblem(technicians.error).message}</p>}
  </DetailPattern>;
}

function ScheduleForm({ job, enquiryId, people }: { job: JobView; enquiryId: string; people: { id: string; displayName: string }[] }) {
  return <CommandDrawer primary={!job.scheduledStart} label={job.scheduledStart ? 'Change schedule' : 'Schedule crew'} title="Schedule crew" submitLabel="Save schedule" enquiryId={enquiryId}
    path={`/jobs/${job.id}/schedule`} schema={scheduleJobRequestSchema} responseSchema={jobResponseSchema}
    build={(form) => ({
      expectedVersion: job.version, scheduledStart: toIso(form.get('scheduledStart')), scheduledFinish: toIso(form.get('scheduledFinish')), technicianIds: form.getAll('technicianId'),
    })}>
    {(fields) => {
      const finish = fields.scheduledFinish?.[0];
      return <>
        <Field label="Starts (local time)" error={fields.scheduledStart && 'Enter a valid date and time.'}>{(control) => <input {...control} name="scheduledStart" type="datetime-local" defaultValue={isoToLocal(job.scheduledStart)} required />}</Field>
        <Field label="Finishes (local time)" error={finish && (finish === ORDERED ? 'The finish must be after the start.' : 'Enter a valid date and time.')}>{(control) => <input {...control} name="scheduledFinish" type="datetime-local" defaultValue={isoToLocal(job.scheduledFinish)} required />}</Field>
        <fieldset><legend>Technicians</legend>
          {people.length === 0 && <p>No active technicians found.</p>}
          {people.map((person) => <label key={person.id} className="check-row"><input type="checkbox" name="technicianId" value={person.id} defaultChecked={job.technicianIds.includes(person.id)} /> {person.displayName}</label>)}
          {fields.technicianIds && <p className="form-error">Choose at least one active technician.</p>}
        </fieldset>
      </>;
    }}
  </CommandDrawer>;
}
