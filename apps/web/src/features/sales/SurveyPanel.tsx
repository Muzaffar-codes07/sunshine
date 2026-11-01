import {
  rejectSurveySchema, rescheduleSurveySchema, roofDirectionSchema, scheduleSurveySchema, submitSurveySchema, surveyResponseSchema,
  type EnquiryDetail, type Survey,
} from '@sunshine/contracts';
import { DetailPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { CommandButton, CommandDrawer } from './CommandDrawer';
import { describeProblem, formatWhen, humanize, isoToLocal, localToIso, useAssignedSurveys, useEnquirySurveys, useStaff } from './queries';

const OPEN_SURVEY = ['SCHEDULED', 'SUBMITTED'];

/** Site surveys for one qualified enquiry: schedule, reschedule, then approve or reject what the technician recorded. */
export function SurveyPanel({ enquiry }: { enquiry: EnquiryDetail }) {
  const surveys = useEnquirySurveys(enquiry.id);
  const items = surveys.data?.data.items ?? [];
  const latest = [...items].sort((a, b) => b.revision - a.revision)[0];
  const canSchedule = enquiry.status === 'QUALIFIED' && (!latest || !OPEN_SURVEY.includes(latest.status));

  return <section className="pattern-card" aria-labelledby="survey-heading">
    <h2 id="survey-heading">Site survey</h2>
    {surveys.isPending && <p role="status">Loading surveys…</p>}
    {surveys.error && <p role="alert">{describeProblem(surveys.error).message}</p>}
    {enquiry.status !== 'QUALIFIED' && !items.length && <p>Qualify the enquiry before scheduling a survey.</p>}
    {latest && <SurveyFacts survey={latest} />}
    <div className="action-row">
      {canSchedule && <SchedulingDrawer enquiryId={enquiry.id} label={latest ? 'Schedule a new survey' : 'Schedule survey'} />}
      {latest?.status === 'SCHEDULED' && <SchedulingDrawer enquiryId={enquiry.id} survey={latest} label="Reschedule" />}
      {latest?.status === 'SUBMITTED' && <>
        <CommandButton primary label="Approve survey" enquiryId={enquiry.id} path={`/surveys/${latest.id}/approve`} body={{ version: latest.version }} responseSchema={surveyResponseSchema} />
        <CommandDrawer label="Reject survey" title="Reject this survey" submitLabel="Reject survey" enquiryId={enquiry.id}
          path={`/surveys/${latest.id}/reject`} schema={rejectSurveySchema} responseSchema={surveyResponseSchema}
          build={(form) => ({ version: latest.version, reason: form.get('reason') })}>
          {(fields) => <Field label="Reason" hint="The technician sees this when the survey is redone." error={fields.reason?.[0]}>
            {(control) => <textarea {...control} name="reason" required maxLength={500} />}
          </Field>}
        </CommandDrawer>
      </>}
    </div>
    {items.length > 1 && <details><summary>Earlier revisions</summary><ul>
      {items.filter((survey) => survey.id !== latest?.id).map((survey) => <li key={survey.id}>Revision {survey.revision}: {humanize(survey.status)}{survey.decisionReason && ` — ${survey.decisionReason}`}</li>)}
    </ul></details>}
  </section>;
}

function SurveyFacts({ survey }: { survey: Survey }) {
  return <DetailPattern title={`Revision ${survey.revision}: ${humanize(survey.status)}`} entries={([
    { id: 'technician', label: 'Technician', value: survey.technician.displayName },
    { id: 'when', label: 'Scheduled for', value: formatWhen(survey.scheduledFor) },
    { id: 'direction', label: 'Roof direction', value: survey.roofDirection ?? '—' },
    { id: 'tilt', label: 'Roof tilt', value: survey.roofTiltDeg ? `${survey.roofTiltDeg}°` : '—' },
    { id: 'cable', label: 'Cable distance', value: survey.cableDistanceM ? `${survey.cableDistanceM} m` : '—' },
    { id: 'area', label: 'Usable roof area', value: survey.usableRoofAreaSqm ? `${survey.usableRoofAreaSqm} m²` : '—' },
    { id: 'notes', label: 'Notes', value: survey.notes ?? '—' },
    { id: 'decision', label: 'Decision', value: survey.decidedBy ? `${survey.decidedBy.displayName}, ${formatWhen(survey.decidedAt)}${survey.decisionReason ? `: ${survey.decisionReason}` : ''}` : '—' },
  ]).filter((entry) => entry.value !== '—')} />;
}

function SchedulingDrawer({ enquiryId, survey, label }: { enquiryId: string; survey?: Survey; label: string }) {
  const technicians = useStaff('TECHNICIAN');
  // The picker must show the current technician before the form opens, or a reschedule would lose it.
  if (!technicians.isSuccess) {
    return <button type="button" disabled title={technicians.isError ? describeProblem(technicians.error).message : undefined}>
      {technicians.isError ? `${label} (technician list unavailable)` : label}
    </button>;
  }
  return <CommandDrawer primary={!survey && label === 'Schedule survey'} label={label} title={survey ? 'Reschedule the survey' : 'Schedule a site survey'} submitLabel={survey ? 'Reschedule' : 'Schedule'}
    enquiryId={enquiryId} path={survey ? `/surveys/${survey.id}/reschedule` : `/enquiries/${enquiryId}/surveys`}
    schema={survey ? rescheduleSurveySchema : scheduleSurveySchema} responseSchema={surveyResponseSchema}
    build={(form) => ({ ...(survey && { version: survey.version }), technicianId: form.get('technicianId'), scheduledFor: localToIso(form.get('scheduledFor')) })}>
    {(fields) => <>
      <Field label="Technician" error={fields.technicianId?.[0]}>
        {(control) => <select {...control} name="technicianId" required defaultValue={survey?.technician.id ?? ''}>
          <option value="">Choose a technician</option>
          {survey && !technicians.data.data.items.some((person) => person.id === survey.technician.id) &&
            <option value={survey.technician.id}>{survey.technician.displayName} (no longer active)</option>}
          {technicians.data.data.items.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>}
      </Field>
      <Field label="Date and time" error={fields.scheduledFor?.[0]}>
        {(control) => <input {...control} name="scheduledFor" type="datetime-local" required defaultValue={isoToLocal(survey?.scheduledFor ?? null)} />}
      </Field>
    </>}
  </CommandDrawer>;
}

/** The technician's view: surveys assigned to them, and the form to record site measurements. */
export function AssignedSurveysPage() {
  const surveys = useAssignedSurveys();
  const items = surveys.data?.data.items ?? [];
  return <>
    <h1>My site surveys</h1>
    {surveys.isPending && <p role="status">Loading your surveys…</p>}
    {surveys.error && <div role="alert"><p>{describeProblem(surveys.error).message}</p><button onClick={() => void surveys.refetch()}>Retry</button></div>}
    {surveys.isSuccess && !items.length && <p>No surveys are assigned to you.</p>}
    {items.map((survey) => <section key={survey.id} className="pattern-card">
      <h2>{survey.site.contactName}, {survey.site.city}</h2>
      <p>{formatWhen(survey.scheduledFor)} · {humanize(survey.status)} · <a href={`tel:${survey.site.phone}`}>{survey.site.phone}</a></p>
      <p>{survey.site.addressLine}, {survey.site.city} {survey.site.pincode}</p>
      {survey.status === 'SCHEDULED' ? <MeasurementsDrawer survey={survey} /> : <SurveyFacts survey={survey} />}
    </section>)}
  </>;
}

function MeasurementsDrawer({ survey }: { survey: Survey }) {
  return <CommandDrawer primary label="Record measurements" title="Site measurements" submitLabel="Submit survey" enquiryId={survey.enquiryId}
    path={`/surveys/${survey.id}/submit`} schema={submitSurveySchema} responseSchema={surveyResponseSchema}
    build={(form) => ({
      version: survey.version, roofDirection: form.get('roofDirection'), roofTiltDeg: form.get('roofTiltDeg'),
      cableDistanceM: form.get('cableDistanceM'), usableRoofAreaSqm: form.get('usableRoofAreaSqm'), notes: form.get('notes'),
    })}>
    {(fields) => <>
      <Field label="Roof direction" error={fields.roofDirection?.[0]}>
        {(control) => <select {...control} name="roofDirection" required defaultValue=""><option value="">Choose direction</option>
          {roofDirectionSchema.options.map((value) => <option key={value} value={value}>{value}</option>)}</select>}
      </Field>
      <Field label="Roof tilt (degrees)" hint="0 to 90, one decimal place" error={fields.roofTiltDeg?.[0]}>
        {(control) => <input {...control} name="roofTiltDeg" inputMode="decimal" required />}
      </Field>
      <Field label="Cable distance (m)" error={fields.cableDistanceM?.[0]}>
        {(control) => <input {...control} name="cableDistanceM" inputMode="decimal" required />}
      </Field>
      <Field label="Usable roof area (m²)" error={fields.usableRoofAreaSqm?.[0]}>
        {(control) => <input {...control} name="usableRoofAreaSqm" inputMode="decimal" required />}
      </Field>
      <Field label="Notes (optional)" error={fields.notes?.[0]}>
        {(control) => <textarea {...control} name="notes" maxLength={2000} />}
      </Field>
    </>}
  </CommandDrawer>;
}
