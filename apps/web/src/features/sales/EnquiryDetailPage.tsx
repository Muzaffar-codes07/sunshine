import { QuotePanel } from '../orders/QuotePanel';
import { Link, useParams } from 'react-router-dom';
import {
  archiveEnquirySchema, assignEnquirySchema, enquiryDetailResponseSchema, qualifyEnquirySchema, type EnquiryDetail,
} from '@sunshine/contracts';
import { DetailPattern, StatusPill } from '../../components/shared/patterns';
import { formatInr } from '../dashboard/dashboard-model';
import { Field } from '../../components/ui/Field';
import { CommandButton, CommandDrawer } from './CommandDrawer';
import { SummaryPanel } from './SummaryPanel';
import { SurveyPanel } from './SurveyPanel';
import { describeProblem, formatWhen, humanize, isoToLocal, localToIso, useEnquiry, useStaff } from './queries';

const OPEN = ['NEW', 'CONTACTED', 'QUALIFIED'];
const yesNo = (value: boolean | null) => (value === null ? '—' : value ? 'Yes' : 'No');

/** Empty facts stay out of the way; the ones that exist are easier to read without them. */
const present = <T extends { value: unknown }>(entries: T[]) => entries.filter((entry) => entry.value !== '—');

export function EnquiryDetailPage() {
  const { id = '' } = useParams();
  const enquiry = useEnquiry(id);
  const staff = useStaff();

  if (enquiry.isPending) return <p role="status">Loading enquiry…</p>;
  if (enquiry.error) return <div role="alert"><h1>Enquiry unavailable</h1><p>{describeProblem(enquiry.error).message}</p>
    <button onClick={() => void enquiry.refetch()}>Retry</button> <Link to="/workspace/sales">Back to the queue</Link></div>;
  const item = enquiry.data.data;
  const owner = staff.data?.data.items.find((person) => person.id === item.ownerId)?.displayName;

  return <>
    <p className="back-link"><Link to="/workspace/sales">← Enquiry queue</Link></p>
    <div className="page-head">
      <div><h1>{item.contactName}</h1><p className="page-sub status-line"><StatusPill status={item.status} /> {item.requestedCapacityKw} kW {item.systemType ? humanize(item.systemType) : ''} · received {formatWhen(item.createdAt)}</p></div>
      <div className="action-row" aria-label="Enquiry actions">
      {item.status === 'NEW' && <CommandButton primary label="Mark contacted" enquiryId={item.id} path={`/enquiries/${item.id}/contacted`} body={{ version: item.version }} responseSchema={enquiryDetailResponseSchema} />}
      {(item.status === 'NEW' || item.status === 'CONTACTED') && <QualifyDrawer enquiry={item} />}
      {OPEN.includes(item.status) && <AssignDrawer enquiry={item} />}
      {item.status !== 'ARCHIVED' && <CommandDrawer label="Archive" title="Archive this enquiry" submitLabel="Archive enquiry" enquiryId={item.id}
        path={`/enquiries/${item.id}/archive`} schema={archiveEnquirySchema} responseSchema={enquiryDetailResponseSchema}
        build={(form) => ({ version: item.version, reason: form.get('reason') })}>
        {(fields) => <Field label="Reason" hint="Archived enquiries stay readable as history." error={fields.reason?.[0]}>
          {(control) => <textarea {...control} name="reason" required maxLength={500} />}
        </Field>}
      </CommandDrawer>}
      </div>
    </div>
    <SummaryPanel enquiryId={item.id} />
    <div className="detail-layout">
      <div className="detail-main">
        <SurveyPanel enquiry={item} />
        <QuotePanel enquiryId={item.id} />
      </div>
      <aside className="detail-side">
        <DetailPattern title="Customer and site" entries={present([
          { id: 'phone', label: 'Phone', value: <a href={`tel:${item.phone}`}>{item.phone}</a> },
          { id: 'email', label: 'Email', value: item.contactEmail ?? '—' },
          { id: 'address', label: 'Site address', value: `${item.siteAddressLine}, ${item.siteCity} ${item.sitePincode}` },
          { id: 'source', label: 'Source', value: humanize(item.source) },
          { id: 'subsidy', label: 'Subsidy interest', value: yesNo(item.subsidyInterest) },
          { id: 'owner', label: 'Owner', value: item.ownerId ? owner ?? 'Assigned' : 'Unassigned' },
          { id: 'followUp', label: 'Next follow-up', value: item.nextFollowUpAt ? formatWhen(item.nextFollowUpAt) : '—' },
          { id: 'message', label: 'Message', value: item.message ?? '—' },
        ])} />
        <DetailPattern title="Qualification" entries={present([
          { id: 'roof', label: 'Shadow-free roof area', value: item.shadowFreeRoofAreaSqm ? `${item.shadowFreeRoofAreaSqm} m²` : '—' },
          { id: 'bill', label: 'Monthly bill', value: item.monthlyBillInr ? formatInr(item.monthlyBillInr) : '—' },
          { id: 'grid', label: 'Grid connection suitable', value: yesNo(item.gridConnectionSuitable) },
          { id: 'closed', label: 'Closed reason', value: item.closedReason ?? '—' },
        ])}>{item.shadowFreeRoofAreaSqm || item.monthlyBillInr || item.gridConnectionSuitable !== null || item.closedReason ? null : <p className="panel-note">No qualification call recorded yet.</p>}</DetailPattern>
      </aside>
    </div>
  </>;
}

function QualifyDrawer({ enquiry }: { enquiry: EnquiryDetail }) {
  return <CommandDrawer primary label="Qualify" title="Qualification call" submitLabel="Save outcome" enquiryId={enquiry.id}
    path={`/enquiries/${enquiry.id}/qualify`} schema={qualifyEnquirySchema} responseSchema={enquiryDetailResponseSchema}
    build={(form) => ({
      version: enquiry.version, shadowFreeRoofAreaSqm: form.get('shadowFreeRoofAreaSqm'), monthlyBillInr: form.get('monthlyBillInr'),
      gridConnectionSuitable: form.get('gridConnectionSuitable') === '' ? undefined : form.get('gridConnectionSuitable') === 'yes',
      outcome: form.get('outcome') || undefined, reason: form.get('reason') || undefined,
    })}>
    {(fields) => <>
      <Field label="Shadow-free roof area (m²)" error={fields.shadowFreeRoofAreaSqm?.[0]}>
        {(control) => <input {...control} name="shadowFreeRoofAreaSqm" inputMode="decimal" required />}
      </Field>
      <Field label="Monthly electricity bill (₹)" error={fields.monthlyBillInr?.[0]}>
        {(control) => <input {...control} name="monthlyBillInr" inputMode="decimal" required />}
      </Field>
      <Field label="Grid connection suitable" error={fields.gridConnectionSuitable?.[0]}>
        {(control) => <select {...control} name="gridConnectionSuitable" required defaultValue=""><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select>}
      </Field>
      <Field label="Outcome" error={fields.outcome?.[0]}>
        {(control) => <select {...control} name="outcome" required defaultValue=""><option value="">Choose</option><option value="QUALIFIED">Qualified</option><option value="DISQUALIFIED">Disqualified</option></select>}
      </Field>
      <Field label="Reason" hint="Required when disqualifying." error={fields.reason?.[0]}>
        {(control) => <textarea {...control} name="reason" maxLength={500} />}
      </Field>
    </>}
  </CommandDrawer>;
}

function AssignDrawer({ enquiry }: { enquiry: EnquiryDetail }) {
  const staff = useStaff();
  // Without the staff list the current owner can't be shown, and saving would silently unassign it.
  if (!staff.isSuccess) {
    return <button type="button" disabled title={staff.isError ? describeProblem(staff.error).message : undefined}>
      {staff.isError ? 'Assign (staff list unavailable)' : 'Assign'}
    </button>;
  }
  const owners = staff.data.data.items.filter((person) => person.role === 'SALES' || person.role === 'ADMIN');
  const currentMissing = enquiry.ownerId && !owners.some((person) => person.id === enquiry.ownerId);
  return <CommandDrawer label="Assign" title="Owner and follow-up" submitLabel="Save" enquiryId={enquiry.id}
    path={`/enquiries/${enquiry.id}/assign`} schema={assignEnquirySchema} responseSchema={enquiryDetailResponseSchema}
    build={(form) => ({ version: enquiry.version, ownerId: form.get('ownerId') || null, nextFollowUpAt: localToIso(form.get('nextFollowUpAt')) || null })}>
    {(fields) => <>
      <Field label="Owner" error={fields.ownerId?.[0]}>
        {(control) => <select {...control} name="ownerId" defaultValue={enquiry.ownerId ?? ''}>
          <option value="">Unassigned</option>
          {currentMissing && <option value={enquiry.ownerId!}>Current owner (no longer active)</option>}
          {owners.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>}
      </Field>
      <Field label="Next follow-up" hint="Leave blank to clear the follow-up." error={fields.nextFollowUpAt?.[0]}>
        {(control) => <input {...control} name="nextFollowUpAt" type="datetime-local" defaultValue={isoToLocal(enquiry.nextFollowUpAt)} />}
      </Field>
    </>}
  </CommandDrawer>;
}
