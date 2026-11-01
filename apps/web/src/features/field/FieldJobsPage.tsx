import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarStack } from '../../components/shared/Brand';
import { FilterChips, ListPattern, StatusPill } from '../../components/shared/patterns';
import { useStaffSession } from '../auth/session';
import { statusFilters, type JobFilter } from '../dashboard/dashboard-model';
import { describeProblem, formatWhen } from '../sales/queries';
import { useFieldJobs } from './queries';

function Jobs({ assignedOnly }: { assignedOnly: boolean }) {
  const jobs = useFieldJobs(assignedOnly);
  const [filter, setFilter] = useState<JobFilter>('ALL');
  const all = jobs.data ?? [], shown = filter === 'ALL' ? all : all.filter((job) => job.status === filter);
  return <>
    <div className="page-head">
      <div><h1>Installations</h1><p className="page-sub">{assignedOnly ? 'Your open jobs, soonest first.' : 'Every installation job, newest first.'}</p></div>
      <FilterChips label="Filter jobs by status" options={statusFilters(all)} value={filter} onChange={setFilter} />
    </div>
    <ListPattern title={assignedOnly ? 'Your jobs' : 'All jobs'} empty={filter !== 'ALL' ? 'No jobs with this status.' : assignedOnly ? 'No open jobs are assigned to you.' : 'No jobs yet.'}
      columns={[{ id: 'order', label: 'Order' }, { id: 'site', label: 'Site' }, { id: 'system', label: 'System' }, { id: 'crew', label: 'Crew' }, { id: 'when', label: 'Scheduled' }, { id: 'status', label: 'Status' }]}
      loading={jobs.isPending} error={jobs.error ? describeProblem(jobs.error).message : undefined} onRetry={() => void jobs.refetch()}
      rows={shown.map((job) => ({ id: job.id, cells: {
        order: <Link to={`/workspace/field-service/jobs/${job.id}`}>{job.orderDisplayNumber}</Link>,
        site: <span>{job.contactName}<small>{job.siteAddress}</small></span>,
        system: `${job.soldCapacityKw} kW ${job.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'}`,
        crew: job.crew.length ? <AvatarStack names={job.crew.map((member) => member.displayName)} size={28} /> : 'None assigned',
        when: job.scheduledStart ? formatWhen(job.scheduledStart) : 'Not scheduled', status: <StatusPill status={job.status} />,
      } }))} />
  </>;
}

export function FieldJobsPage() {
  const session = useStaffSession();
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  if (!session.data || !['TECHNICIAN', 'ADMIN'].includes(session.data.role)) return <p role="alert">Your role cannot use the field workspace.</p>;
  return <Jobs assignedOnly={session.data.role === 'TECHNICIAN'} />;
}
