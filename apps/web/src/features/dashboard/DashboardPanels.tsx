import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, FileText, FolderOpen, HardHat, LayoutGrid, ShieldCheck, Sun, TriangleAlert, Users } from 'lucide-react';
import type { JobView, StaffRole } from '@sunshine/contracts';
import { AvatarStack } from '../../components/shared/Brand';
import { SolarArt, WaveArt } from '../../components/shared/SolarArt';
import { humanize } from '../sales/queries';
import { shortTicketNumber } from '../service/service-model';
import { useMonthOverview, useStockCheck, useTechnicianCount } from './dashboard-data';
import { documentRows, formatInr, linePath, performance, pickSpotlight, projectHref, teamFacts, type DocumentRow } from './dashboard-model';
import { PanelError, PanelLoading } from './DashboardStates';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function PerformanceCard({ jobs, role, loading }: { jobs: JobView[]; role: StaffRole; loading: boolean }) {
  const facts = performance(jobs, new Date());
  const overview = useMonthOverview(role);
  const change = facts.doneThisMonth - facts.doneLastMonth;
  const history = role !== 'TECHNICIAN';
  const hasTrend = facts.completedByWeek.some(Boolean) || facts.startedByWeek.some(Boolean);
  const rows = role === 'ADMIN' && overview.data
    ? [{ label: 'Invoiced this month', value: formatInr(overview.data.invoicedRevenue) }, { label: 'Cash received', value: formatInr(overview.data.cashReceived) }, { label: 'Actual cost', value: formatInr(overview.data.actualCost) }]
    : [{ label: 'Scheduled', value: String(facts.scheduled) }, { label: 'In progress', value: String(facts.inProgress) }, ...(history ? [{ label: 'Completed', value: String(facts.completed) }] : [])];
  return <section className="panel perf" aria-labelledby="perf-title">
    <div className="panel-head"><h2 id="perf-title">Project performance</h2>{role === 'ADMIN' && <Link className="corner-link" to="/workspace/reports" aria-label="Open finance reports"><LayoutGrid size="1rem" aria-hidden="true" /></Link>}</div>
    {loading ? <PanelLoading label="Loading project performance" /> : <>
      <p className="metric-label">Active installations</p>
      <p className="metric-value">{facts.active}</p>
      {history && <p className="metric-note">{facts.doneThisMonth} completed{change !== 0 && ` · ${change > 0 ? '+' : '−'}${Math.abs(change)} on last month`}</p>}
      {history && hasTrend && <ul className="trend-legend"><li><i style={{ background: '#1F2A44' }} /> Completed</li><li><i style={{ background: '#C6A75E' }} /> Started</li></ul>}
      {history && (hasTrend
        ? <svg className="trend" viewBox="0 0 200 56" preserveAspectRatio="none" role="img" aria-label={`Over the last 8 weeks: ${facts.completedByWeek.reduce((a, b) => a + b, 0)} completed and ${facts.startedByWeek.reduce((a, b) => a + b, 0)} started.`}>
          <path d={linePath(facts.startedByWeek, 200, 56)} fill="none" stroke="#C6A75E" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={linePath(facts.completedByWeek, 200, 56)} fill="none" stroke="#1F2A44" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        : <p className="trend-empty">The trend starts with the first job.</p>)}
      <ul className="metric-rows">{rows.map((row) => <li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul>
    </>}
  </section>;
}

export function SpotlightCard({ jobs, role, loading }: { jobs: JobView[]; role: StaffRole; loading: boolean }) {
  const job = pickSpotlight(jobs, Date.now());
  const photo = job && (role === 'ADMIN' || role === 'TECHNICIAN' || role === 'SALES') ? job.photoFileIds[0] : undefined;
  return <section className="spotlight" aria-labelledby="spotlight-title">
    {photo ? <img className="spotlight-art" src={`/api/v1/files/${photo}/content`} alt={`Roof photo uploaded for ${job!.orderDisplayNumber}`} /> : <SolarArt className="spotlight-art" />}
    <div className="spotlight-body">
      <h2 id="spotlight-title"><Sun size="1rem" aria-hidden="true" /> Project spotlight</h2>
      <div className="spotlight-foot">
        {loading && <p>Loading…</p>}
        {!loading && !job && <p>No projects yet. New orders appear here.</p>}
        {job && <>
          <p className="spotlight-name">{job.contactName}</p>
          <p className="spotlight-meta">{job.orderDisplayNumber} · {job.soldCapacityKw} kW {job.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'}</p>
          <p className="spotlight-status">{humanize(job.status)}</p>
          <div className="spotlight-owner">
            {job.crew.length ? <AvatarStack names={job.crew.map((member) => member.displayName)} size={30} /> : <span className="spotlight-nocrew">No crew yet</span>}
            <Link to={projectHref(job, role)}>View project <ArrowUpRight size="0.875rem" aria-hidden="true" /></Link>
          </div>
        </>}
      </div>
    </div>
  </section>;
}

export function DocumentsCard({ jobs, role, approvals, loading }: { jobs: JobView[]; role: StaffRole; approvals: DocumentRow[]; loading: boolean }) {
  const rows = documentRows(jobs, role, approvals);
  const viewAll = role === 'WAREHOUSE' ? '/workspace/warehouse' : role === 'TECHNICIAN' ? '/workspace/field-service' : '/workspace/sales';
  return <section className="panel docs" aria-labelledby="docs-title">
    <div className="panel-head docs-head"><span className="pill-icon" aria-hidden="true"><FolderOpen size="1.0625rem" /></span><h2 id="docs-title">Documents &amp; approvals</h2></div>
    {loading ? <PanelLoading lines={4} label="Loading documents" /> : rows.length === 0
      ? <p className="panel-empty">Documents appear here as orders progress.</p>
      : <ul className="doc-list">{rows.map((row) => <li key={row.id}><Link className="doc-row" to={row.href}><FileText size="1.125rem" aria-hidden="true" /><span className="doc-name">{row.name}<small>{row.detail}</small></span><span className="doc-status">{row.status}</span></Link></li>)}</ul>}
    <Link className="panel-link" to={viewAll}>View all</Link>
  </section>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="stat"><span className="stat-icon" aria-hidden="true">{icon}</span><span><span className="stat-label">{label}</span><strong>{value}</strong></span></div>;
}

export function TeamOperations({ jobs, role, loading, error, onRetry }: { jobs: JobView[]; role: StaffRole; loading: boolean; error: unknown; onRetry: () => void }) {
  const facts = teamFacts(jobs, new Date());
  const technicians = useTechnicianCount(role);
  const stock = useStockCheck(role);
  const total = technicians.data ?? facts.knownCrew.length;
  const peak = Math.max(...facts.days.map((day) => day.count), 1);
  const weekShare = facts.weekTotal ? Math.round(facts.weekDone / facts.weekTotal * 100) : 0;
  const crewShare = total ? Math.round(facts.assignedToday.length / total * 100) : 0;
  return <section className="panel team" aria-labelledby="team-title">
    <div className="team-head">
      <h2 id="team-title">Team</h2>
      <span className="team-count">{total}</span>
      <div className="team-stats">
        <Stat icon={<Users size="1rem" />} label="Assigned today" value={facts.assignedToday.length} />
        <Stat icon={<HardHat size="1rem" />} label="On site now" value={facts.onSite.length} />
        <Stat icon={<CalendarClock size="1rem" />} label="Next 7 days" value={plural(facts.days.reduce((sum, day) => sum + day.count, 0), 'job')} />
      </div>
    </div>
    {loading ? <PanelLoading lines={4} label="Loading team and operations" /> : error ? <PanelError error={error} onRetry={onRetry} /> : <div className="ops">
      <WaveArt className="ops-art" />
      <div className="ops-col">
        <h3>Scheduled installations</h3>
        <p className="ops-sub">This week</p>
        {facts.weekCrew.length > 0 ? <AvatarStack names={facts.weekCrew} max={4} size={36} /> : <p className="ops-none">No crew this week</p>}
        <div className="ops-progress">
          <div><span>Completed</span><span>{facts.weekDone} of {facts.weekTotal}</span></div>
          <div className="bar" role="progressbar" aria-label="Completed this week" aria-valuenow={weekShare} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${weekShare}%` }} /></div>
        </div>
      </div>
      <div className="ops-col">
        <h3>Field teams</h3>
        <p className="ops-sub">Today</p>
        {facts.assignedToday.length > 0 ? <AvatarStack names={facts.assignedToday} max={4} size={36} /> : <p className="ops-none">Nobody assigned today</p>}
        <div className="ops-progress">
          <div><span>Assigned</span><span>{facts.assignedToday.length} of {total}</span></div>
          <div className="bar" role="progressbar" aria-label="Technicians assigned today" aria-valuenow={crewShare} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${crewShare}%` }} /></div>
        </div>
      </div>
      <div className="ops-col ops-ready">
        <h3>Operational readiness</h3>
        <ul className="ready-list">
          <li>{facts.noCrew.length === 0 ? <ShieldCheck size="0.9375rem" aria-hidden="true" /> : <TriangleAlert size="0.9375rem" aria-hidden="true" />} {facts.noCrew.length === 0 ? 'Every job has a crew' : `${plural(facts.noCrew.length, 'job')} without a crew`}</li>
          {stock.data && <li>{stock.data.ok ? <ShieldCheck size="0.9375rem" aria-hidden="true" /> : <TriangleAlert size="0.9375rem" aria-hidden="true" />} {stock.data.ok ? 'Stock ledger checks passed' : 'Stock ledger needs review'}</li>}
        </ul>
        <div className="day-bars" role="img" aria-label={`Installations by day: ${facts.days.map((day) => `${day.label} ${day.count}`).join(', ')}`}>
          {facts.days.map((day, index) => <span key={`${day.label}-${index}`} className="day-bar"><i className={index === 0 ? 'is-today' : ''} style={{ height: `${Math.max(day.count / peak * 100, 6)}%` }} /><small>{day.label}</small></span>)}
        </div>
      </div>
    </div>}
  </section>;
}

/** A support login has no job access, so its overview is the service queue. */
export function SupportOverview({ tickets, loading, error, onRetry }: { tickets: { id: string; ticketNumber: string; faultDescription: string; status: string }[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const open = tickets.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status));
  return <section className="panel" aria-labelledby="support-title">
    <div className="panel-head"><h2 id="support-title">Service queue</h2></div>
    {loading ? <PanelLoading label="Loading service tickets" /> : error ? <PanelError error={error} onRetry={onRetry} /> : <>
      <p className="metric-label">Open tickets</p><p className="metric-value">{open.length}</p>
      {open.length === 0 ? <p className="panel-empty">No open tickets.</p> : <ul className="doc-list">{open.slice(0, 5).map((ticket) => <li key={ticket.id}><Link className="doc-row" to={`/workspace/service?ticket=${ticket.id}`}><FileText size="1.125rem" aria-hidden="true" /><span className="doc-name">{shortTicketNumber(ticket.ticketNumber)}<small>{ticket.faultDescription}</small></span><span className="doc-status">{humanize(ticket.status)}</span></Link></li>)}</ul>}
    </>}
  </section>;
}
