import { Link } from 'react-router-dom';
import { ListPattern } from '../../components/shared/patterns';
import { useStaffSession } from '../auth/session';
import { describeProblem, formatWhen, humanize } from '../sales/queries';
import { useFieldJobs } from './queries';

function Jobs({ assignedOnly }: { assignedOnly: boolean }) {
  const jobs = useFieldJobs(assignedOnly);
  return <ListPattern title={assignedOnly ? 'Your jobs' : 'All jobs'} empty={assignedOnly ? 'No open jobs are assigned to you.' : 'No jobs yet.'}
    columns={[{ id: 'order', label: 'Order' }, { id: 'site', label: 'Site' }, { id: 'when', label: 'Scheduled' }, { id: 'status', label: 'Status' }]}
    loading={jobs.isPending} error={jobs.error ? describeProblem(jobs.error).message : undefined} onRetry={() => void jobs.refetch()}
    rows={(jobs.data ?? []).map((job) => ({ id: job.id, cells: {
      order: <Link to={`/workspace/field-service/jobs/${job.id}`}>{job.orderDisplayNumber}</Link>,
      site: `${job.contactName}, ${job.siteAddress}`, when: job.scheduledStart ? formatWhen(job.scheduledStart) : 'Not scheduled', status: humanize(job.status),
    } }))} />;
}

export function FieldJobsPage() {
  const session = useStaffSession();
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  if (!session.data || !['TECHNICIAN', 'ADMIN'].includes(session.data.role)) return <p role="alert">Your role cannot use the field workspace.</p>;
  return <><h1>Field jobs</h1><Jobs assignedOnly={session.data.role === 'TECHNICIAN'} /></>;
}
