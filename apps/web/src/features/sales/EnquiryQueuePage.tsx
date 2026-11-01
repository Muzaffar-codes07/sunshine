import { useState } from 'react';
import { Link } from 'react-router-dom';
import { enquiryStatusSchema } from '@sunshine/contracts';
import { ListPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { useStaffSession } from '../auth/session';
import { AssignedSurveysPage } from './SurveyPanel';
import { describeProblem, formatWhen, humanize, useEnquiries } from './queries';

const columns = [
  { id: 'name', label: 'Customer' }, { id: 'phone', label: 'Phone' }, { id: 'city', label: 'City' },
  { id: 'capacity', label: 'Capacity' }, { id: 'status', label: 'Status' }, { id: 'followUp', label: 'Next follow-up' },
  { id: 'received', label: 'Received' },
];

/** Sales workspace landing: the enquiry queue for sales and admin; technicians see their assigned surveys instead. */
export function SalesWorkspacePage() {
  const session = useStaffSession();
  return session.data?.role === 'TECHNICIAN' ? <AssignedSurveysPage /> : <EnquiryQueuePage />;
}

export function EnquiryQueuePage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const enquiries = useEnquiries(status, page);
  const data = enquiries.data?.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return <>
    <h1>CRM</h1>
    <p><Link to="/enquire">Open the public enquiry form</Link> to take an enquiry by phone.</p>
    <Field label="Show enquiries">
      {(control) => <select {...control} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="">All statuses</option>
        {enquiryStatusSchema.options.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
      </select>}
    </Field>
    <ListPattern
      title={data ? `Enquiries (${data.total})` : 'Enquiries'}
      columns={columns}
      loading={enquiries.isPending}
      error={enquiries.error ? describeProblem(enquiries.error).message : undefined}
      onRetry={() => void enquiries.refetch()}
      empty="No enquiries match this filter."
      rows={(data?.items ?? []).map((item) => ({ id: item.id, cells: {
        name: <Link to={`/workspace/sales/enquiries/${item.id}`}>{item.contactName}</Link>,
        phone: item.phone, city: item.siteCity, capacity: `${item.requestedCapacityKw} kW`,
        status: humanize(item.status), followUp: formatWhen(item.nextFollowUpAt), received: formatWhen(item.createdAt),
      } }))}
    />
    {data && pages > 1 && <nav className="pager" aria-label="Enquiry pages">
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
    </nav>}
  </>;
}
