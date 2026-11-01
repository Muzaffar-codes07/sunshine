import { useStaffSession } from '../auth/session';
import { useDashboardJobs, useOpenTickets, useSurveyApprovals } from './dashboard-data';
import { DocumentsCard, PerformanceCard, SpotlightCard, SupportOverview, TeamOperations } from './DashboardPanels';
import { ScheduleTimeline } from './ScheduleTimeline';
import './dashboard.css';

/** The flagship overview. The shell renders the page title, and each panel shows only what this role's API access returns. */
export function DashboardPage() {
  const session = useStaffSession();
  const role = session.data?.role;
  if (!role) return null;
  return <Dashboard role={role} />;
}

function Dashboard({ role }: { role: NonNullable<ReturnType<typeof useStaffSession>['data']>['role'] }) {
  const jobs = useDashboardJobs(role);
  const tickets = useOpenTickets(role);
  const approvals = useSurveyApprovals(role);
  if (role === 'SUPPORT') return <SupportOverview tickets={tickets.data?.items ?? []} loading={tickets.isPending} error={tickets.error} onRetry={() => void tickets.refetch()} />;
  const items = jobs.data?.items ?? [];
  return <div className="dash">
    <div className="dash-top">
      <ScheduleTimeline jobs={items} role={role} loading={jobs.isPending} error={jobs.error} onRetry={() => void jobs.refetch()} total={jobs.data?.total ?? 0} />
      <PerformanceCard jobs={items} role={role} loading={jobs.isPending} />
      <SpotlightCard jobs={items} role={role} loading={jobs.isPending} />
    </div>
    <div className="dash-bottom">
      <DocumentsCard jobs={items} role={role} approvals={approvals.data ?? []} loading={jobs.isPending} />
      <TeamOperations jobs={items} role={role} loading={jobs.isPending} error={jobs.error} onRetry={() => void jobs.refetch()} />
    </div>
  </div>;
}
