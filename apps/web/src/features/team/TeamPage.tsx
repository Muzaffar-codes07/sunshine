import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { staffDirectoryResponseSchema, type JobView } from '@sunshine/contracts';
import { Avatar } from '../../components/shared/Brand';
import { ListPattern, MoneyStrip, StatusPill } from '../../components/shared/patterns';
import { apiGet } from '../../lib/api';
import { useStaffSession } from '../auth/session';
import { useDashboardJobs } from '../dashboard/dashboard-data';
import { crewRows, projectHref, type CrewState } from '../dashboard/dashboard-model';
import { describeProblem, formatWhen, humanize } from '../sales/queries';

/** Who is on site, who is assigned today and what comes next, worked out from real job crews. */
export function TeamPage() {
  const role = useStaffSession().data?.role ?? 'ADMIN';
  const [now] = useState(() => new Date());
  const staff = useQuery({ queryKey: ['team', 'staff'], retry: false, queryFn: ({ signal }) => apiGet('/staff', staffDirectoryResponseSchema, signal) });
  const jobs = useDashboardJobs(role);
  const people = staff.data?.data.items ?? [], jobItems = jobs.data?.items ?? [];
  const rows = crewRows(people.filter((person) => person.role === 'TECHNICIAN'), jobItems, now);
  const others = people.filter((person) => person.role !== 'TECHNICIAN');
  const count = (state: CrewState) => String(rows.filter((row) => row.state === state).length);
  const failure = staff.error ?? jobs.error;
  const jobCell = (job: JobView | undefined, empty: string) => job
    ? <><Link to={projectHref(job, role)}>{job.orderDisplayNumber} · {job.contactName}</Link>{job.scheduledStart && <small className="cell-sub">{formatWhen(job.scheduledStart)}</small>}</>
    : empty;

  return <section aria-labelledby="team-page-title">
    <div className="page-head"><div>
      <h1 id="team-page-title">Team</h1>
      <p className="page-sub">Who is on site, who is assigned today and what each technician has next.</p>
    </div></div>
    {staff.isSuccess && jobs.isSuccess && <MoneyStrip label="Technicians today" items={[
      { id: 'site', label: 'On site now', value: count('ON_SITE') },
      { id: 'assigned', label: 'Assigned today', value: count('ASSIGNED') },
      { id: 'free', label: 'Free today', value: count('FREE') },
    ]} />}
    <div className="detail-layout">
      <div className="detail-main">
        <section className="pattern-card titled-list">
          <h2>Field technicians</h2>
          <ListPattern title="Field technicians" loading={staff.isPending || jobs.isPending} error={failure ? describeProblem(failure).message : undefined}
            onRetry={() => { void staff.refetch(); void jobs.refetch(); }} empty="No technicians yet."
            columns={[{ id: 'name', label: 'Technician' }, { id: 'status', label: 'Status' }, { id: 'today', label: 'Today' }, { id: 'next', label: 'Next job' }, { id: 'open', label: 'Open jobs' }]}
            rows={rows.map((row) => ({ id: row.member.id, cells: {
              name: <span className="person"><Avatar name={row.member.displayName} size={32} />{row.member.displayName}</span>,
              status: <StatusPill status={row.state} />,
              today: jobCell(row.current, 'Nothing booked'), next: jobCell(row.next, 'Nothing scheduled'), open: row.open,
            } }))} />
          {jobs.data && jobs.data.total > jobItems.length && <p className="panel-note">Based on the newest {jobItems.length} of {jobs.data.total} jobs.</p>}
        </section>
      </div>
      <aside className="detail-side">
        <section className="pattern-card">
          <h2>Office and warehouse</h2>
          {staff.isPending ? <p role="status">Loading staff…</p> : others.length === 0
            ? <p>Nobody else on the team yet.</p>
            : <ul className="person-list">{others.map((person) => <li key={person.id}><span className="person"><Avatar name={person.displayName} size={32} />{person.displayName}</span><span className="field-hint">{humanize(person.role)}</span></li>)}</ul>}
        </section>
      </aside>
    </div>
  </section>;
}
