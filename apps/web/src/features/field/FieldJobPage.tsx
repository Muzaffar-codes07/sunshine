import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { completeInstallationRequestSchema, jobResponseSchema, startInstallationRequestSchema, type JobView } from '@sunshine/contracts';
import { PhotoCapture, SignaturePad } from '../../components/device';
import { CommandFeedback } from '../../components/shared/CommandFeedback';
import { DetailPattern, ListPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { checkInput, describeFailure, useRetrySafeCommand } from '../../lib/command';
import { useStaffSession } from '../auth/session';
import { describeProblem, formatWhen, humanize, isoToLocal, localToIso } from '../sales/queries';
import { fieldRoot, loadEvidence, saveEvidence, uploadJobFile, useFieldJob, type Evidence } from './queries';

const toIso = (value: FormDataEntryValue | null) => {
  try { return localToIso(value); } catch { return ''; }
};

function StartJob({ job }: { job: JobView }) {
  const command = useRetrySafeCommand(jobResponseSchema, fieldRoot);
  // Rounded down to the minute, the suggestion could fall before a delivery made moments ago. Left alone, it means now.
  const [suggested] = useState(() => isoToLocal(new Date().toISOString()));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('startedAt');
    const checked = checkInput(startInstallationRequestSchema, { expectedVersion: job.version, startedAt: value === suggested ? new Date().toISOString() : toIso(value) }, { startedAt: 'Enter a valid date and time.' });
    if ('problem' in checked) { command.setProblem(checked.problem); return; }
    command.run(`/jobs/${job.id}/start`, checked.data);
  }
  return <section className="pattern-card"><h2>Start work</h2>
    <form onSubmit={submit} noValidate aria-busy={command.busy}>
      <fieldset disabled={command.busy || command.uncertain}>
        <legend>Arrived on site</legend>
        <Field label="Started at (local time)" error={command.problem.fields.startedAt}>{(control) => <input {...control} name="startedAt" type="datetime-local" defaultValue={suggested} required />}</Field>
        <button type="submit">{command.busy ? 'Starting…' : 'Start job'}</button>
      </fieldset>
    </form>
    <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry} />
  </section>;
}

function EvidenceFiles({ jobId, evidence, onChange, photoError, signatureError }: { jobId: string; evidence: Evidence; onChange: (next: Evidence) => void; photoError?: string; signatureError?: string }) {
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');
  const [picker, setPicker] = useState(0);
  async function upload(file: Blob, name: string, added: (id: string) => Evidence) {
    setUploading(true); setProblem('');
    try { onChange(added((await uploadJobFile(jobId, file, name)).id)); }
    catch (error) { setProblem(describeFailure(error).messages.join(' ')); }
    finally { setUploading(false); }
  }
  return <>
    <h3>Roof photos</h3>
    {evidence.photos.length > 0 && <ul>{evidence.photos.map((photo) => <li key={photo.id}>{photo.name} <button type="button" onClick={() => onChange({ ...evidence, photos: evidence.photos.filter((row) => row.id !== photo.id) })}>Don't use</button></li>)}</ul>}
    <PhotoCapture key={picker} label="Add a roof photo" hint="Each photo uploads straight away." disabled={uploading}
      onChange={(file) => { if (file) void upload(file, file.name, (id) => ({ ...evidence, photos: [...evidence.photos, { id, name: file.name }] })).then(() => setPicker((value) => value + 1)); }} />
    {photoError && <p className="form-error">{photoError}</p>}
    <h3>Customer signature</h3>
    {evidence.signatureId
      ? <p role="status">Signature saved. <button type="button" onClick={() => onChange({ ...evidence, signatureId: null })}>Sign again</button></p>
      : <SignaturePad label="Sign here" hint="Ask the customer to sign, then press Export PNG to save it." disabled={uploading}
        onExport={(blob) => void upload(blob, 'signature.png', (id) => ({ ...evidence, signatureId: id }))} />}
    {signatureError && <p className="form-error">{signatureError}</p>}
    {uploading && <p role="status">Uploading…</p>}
    {problem && <p role="alert" className="form-error">{problem}</p>}
  </>;
}

function CompleteJob({ job }: { job: JobView }) {
  const [evidence, setEvidence] = useState<Evidence>(() => loadEvidence(job.id));
  const command = useRetrySafeCommand(jobResponseSchema, fieldRoot, () => saveEvidence(job.id, null));
  const checks = job.systemType === 'OFF_GRID'
    ? ['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION', 'BATTERY'] : ['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION'];
  const { fields } = command.problem;
  // Date fields hold whole minutes. Left as suggested they mean the exact times, or the first default would be refused for
  // falling just outside the job. Rounded down, a crew member's "from" would come before the job's real start.
  const [now] = useState(() => isoToLocal(new Date().toISOString()));
  const started = isoToLocal(job.startedAt);
  function update(next: Evidence) { setEvidence(next); saveEvidence(job.id, next); }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const finishedAt = form.get('finishedAt') === now ? new Date().toISOString() : toIso(form.get('finishedAt'));
    const timeRecords = job.crew.flatMap((member) => {
      const from = form.get(`from:${member.id}`), to = form.get(`to:${member.id}`);
      if (!from && !to) return [];
      return [{ technicianId: member.id, startedAt: from === started ? job.startedAt : toIso(from), finishedAt: to === now ? finishedAt : toIso(to) }];
    });
    const checked = checkInput(completeInstallationRequestSchema, {
      expectedVersion: job.version, startedAt: job.startedAt, finishedAt, installedCapacityKw: Number(form.get('installedCapacityKw')),
      photoFileIds: evidence.photos.map((photo) => photo.id), signatureFileId: evidence.signatureId ?? '', signerName: form.get('signerName'),
      completedChecks: form.getAll('check'), timeRecords,
    }, {
      finishedAt: 'Enter a valid date and time, after the start.', photoFileIds: 'Add at least one roof photo.', signatureFileId: 'Save the customer\'s signature.',
      signerName: 'Enter the name of the person who signed.', completedChecks: 'Tick the checks you finished.', timeRecords: 'Enter time for at least one crew member, within the job\'s start and finish.',
    });
    if ('problem' in checked) { command.setProblem(checked.problem); return; }
    command.run(`/jobs/${job.id}/complete`, checked.data);
  }

  return <section className="pattern-card"><h2>Complete the job</h2>
    <EvidenceFiles jobId={job.id} evidence={evidence} onChange={update} photoError={fields.photoFileIds} signatureError={fields.signatureFileId} />
    <form onSubmit={submit} noValidate aria-busy={command.busy}>
      <fieldset disabled={command.busy || command.uncertain}>
        <legend>Installation details</legend>
        <Field label="Signed by" error={fields.signerName}>{(control) => <input {...control} name="signerName" maxLength={120} defaultValue={job.contactName} required />}</Field>
        <Field label="Installed size (kW)" hint={`Sold as ${job.soldCapacityKw} kW.`} error={fields.installedCapacityKw}>{(control) => <select {...control} name="installedCapacityKw" defaultValue={job.soldCapacityKw}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} kW</option>)}</select>}</Field>
        <Field label="Finished at (local time)" error={fields.finishedAt}>{(control) => <input {...control} name="finishedAt" type="datetime-local" defaultValue={now} required />}</Field>
        <fieldset><legend>Checks finished</legend>
          {checks.map((check) => <label key={check} className="check-row"><input type="checkbox" name="check" value={check} /> {humanize(check)}</label>)}
          {fields.completedChecks && <p className="form-error">{fields.completedChecks}</p>}
        </fieldset>
        <fieldset><legend>Crew time</legend>
          {job.crew.map((member) => <div key={member.id}>
            <Field label={`${member.displayName}: from`}>{(control) => <input {...control} name={`from:${member.id}`} type="datetime-local" defaultValue={started} />}</Field>
            <Field label={`${member.displayName}: to`}>{(control) => <input {...control} name={`to:${member.id}`} type="datetime-local" defaultValue={now} />}</Field>
          </div>)}
          {fields.timeRecords && <p className="form-error">{fields.timeRecords}</p>}
        </fieldset>
        <button type="submit">{command.busy ? 'Completing…' : 'Complete job'}</button>
      </fieldset>
    </form>
    {fields.form && <p className="form-error">{fields.form}</p>}
    <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry} />
  </section>;
}

function CompletedEvidence({ job }: { job: JobView }) {
  const crew = new Map(job.crew.map((member) => [member.id, member.displayName]));
  return <>
    <DetailPattern title="Completed work" entries={[
      { id: 'started', label: 'Started', value: formatWhen(job.startedAt) }, { id: 'finished', label: 'Finished', value: formatWhen(job.finishedAt) },
      { id: 'size', label: 'Installed size', value: `${job.installedCapacityKw} kW` }, { id: 'signer', label: 'Signed by', value: job.signerName },
      { id: 'checks', label: 'Checks', value: job.completedChecks.map(humanize).join(', ') },
    ]} />
    <ListPattern title="Crew time" columns={[{ id: 'who', label: 'Technician' }, { id: 'from', label: 'From' }, { id: 'to', label: 'To' }]}
      rows={job.timeRecords.map((record) => ({ id: record.id, cells: { who: crew.get(record.technicianId) ?? 'Former crew member', from: formatWhen(record.startedAt), to: formatWhen(record.finishedAt) } }))} />
    <section className="pattern-card"><h2>Photos and signature</h2>
      {job.photoFileIds.map((id, index) => <img key={id} className="photo-preview" src={`/api/v1/files/${id}`} alt={`Roof photo ${index + 1}`} />)}
      {job.signatureFileId && <img className="photo-preview" src={`/api/v1/files/${job.signatureFileId}`} alt="Customer signature" />}
    </section>
  </>;
}

function Job({ id }: { id: string }) {
  const query = useFieldJob(id);
  if (query.isPending) return <p role="status">Loading job…</p>;
  if (query.error) return <div role="alert"><p>{describeProblem(query.error).message}</p><button type="button" onClick={() => void query.refetch()}>Retry</button></div>;
  const job = query.data.data;
  return <>
    <h1>{job.orderDisplayNumber}</h1>
    <DetailPattern title="Job" entries={[
      { id: 'status', label: 'Status', value: humanize(job.status) }, { id: 'customer', label: 'Customer', value: job.contactName },
      { id: 'site', label: 'Site', value: job.siteAddress }, { id: 'system', label: 'System', value: `${job.soldCapacityKw} kW ${humanize(job.systemType)}` },
      { id: 'when', label: 'Scheduled', value: job.scheduledStart ? formatWhen(job.scheduledStart) : 'Not scheduled' },
      { id: 'crew', label: 'Crew', value: job.crew.map((member) => member.displayName).join(', ') || 'None assigned' },
    ]} />
    {job.status === 'SCHEDULED' && <StartJob job={job} />}
    {job.status === 'IN_PROGRESS' && <CompleteJob key={job.id} job={job} />}
    {job.status === 'COMPLETED' && <CompletedEvidence job={job} />}
    <p><Link to="/workspace/field-service">Back to your jobs</Link></p>
  </>;
}

export function FieldJobPage({ jobId }: { jobId?: string }) {
  const params = useParams(); const session = useStaffSession();
  const id = jobId ?? params.id;
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  if (!session.data || !['TECHNICIAN', 'ADMIN'].includes(session.data.role)) return <p role="alert">Your role cannot use the field workspace.</p>;
  if (!z.uuid().safeParse(id).success) return <p role="alert">This isn't a valid job link. <Link to="/workspace/field-service">Back to your jobs</Link></p>;
  return <Job id={id!} />;
}
