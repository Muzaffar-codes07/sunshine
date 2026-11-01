import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import type { JobView, StaffRole } from '@sunshine/contracts';
import { AvatarStack } from '../../components/shared/Brand';
import { humanize } from '../sales/queries';
import { barsFor, durationLabel, onDay, projectHref, rangeFor, shiftAnchor, type Period } from './dashboard-model';
import { PanelError, PanelLoading } from './DashboardStates';

const PERIODS: { id: Period; label: string }[] = [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }];
const ROWS = 6;

/** Each bar opens its job. Colour always comes with words, in the bar's label and in the legend. */
export function ScheduleTimeline({ jobs, role, loading, error, onRetry, total }: { jobs: JobView[]; role: StaffRole; loading: boolean; error: unknown; onRetry: () => void; total: number }) {
  const [now] = useState(() => new Date());
  const [anchor, setAnchor] = useState(now);
  const [chosen, setChosen] = useState<Period | null>(null);
  // Open on today when there's work today, otherwise on the week, so the first view is rarely empty.
  const period = chosen ?? (loading || jobs.some((job) => onDay(job, now)) ? 'day' : 'week');
  const range = useMemo(() => rangeFor(period, anchor, jobs), [period, anchor, jobs]);
  const bars = useMemo(() => barsFor(jobs, range, now.getTime(), period), [jobs, range, now, period]);
  const undated = jobs.filter((job) => job.status !== 'COMPLETED' && !job.scheduledStart).length;
  const nowLeft = now.getTime() >= range.start && now.getTime() <= range.end ? (now.getTime() - range.start) / (range.end - range.start) * 100 : null;
  const hidden = bars.length - ROWS;

  return <section className="schedule" aria-labelledby="schedule-title">
    <div className="schedule-head">
      <h2 id="schedule-title">Installation schedule</h2>
      <div className="date-nav">
        <CalendarDays size={16} aria-hidden="true" />
        <span aria-live="polite">{range.title}</span>
        <button type="button" className="date-step" aria-label={`Previous ${period}`} onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}><ChevronLeft size={16} aria-hidden="true" /></button>
        <button type="button" className="date-step" aria-label={`Next ${period}`} onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <div className="segmented" role="group" aria-label="Schedule period">
        {PERIODS.map((item) => <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => setChosen(item.id)}>{item.label}</button>)}
      </div>
    </div>
    {loading && <PanelLoading lines={5} label="Loading the installation schedule" />}
    {!loading && !!error && <PanelError error={error} onRetry={onRetry} />}
    {!loading && !error && <div className="timeline-chart">
      <div className="tl-body">
        <div className="tl-grid" aria-hidden="true">
          {range.ticks.map((tick) => <span key={tick.at} style={{ left: `${(tick.at - range.start) / (range.end - range.start) * 100}%` }} />)}
          {nowLeft !== null && <span className="tl-now" style={{ left: `${nowLeft}%` }} />}
        </div>
        {bars.length === 0 && <p className="tl-empty">No installations in this {period}. {undated > 0 ? `${undated} ${undated === 1 ? 'job is' : 'jobs are'} still waiting for a date.` : 'Scheduled jobs appear here.'}</p>}
        <ul className="tl-rows">
          {bars.slice(0, ROWS).map((bar) => <li key={bar.job.id} className="tl-row">
            <span className="tl-label">{bar.job.orderDisplayNumber}</span>
            <div className="tl-track">
              <Link className={`tl-bar tl-bar--${bar.job.status}${bar.late ? ' is-late' : ''}`} to={projectHref(bar.job, role)} style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                title={`${bar.job.orderDisplayNumber}, ${bar.job.contactName}, ${humanize(bar.job.status)}, ${durationLabel(bar.job)}`}>
                {(bar.late || bar.clash) && <AlertTriangle className="tl-flag" size={14} aria-hidden="true" />}
                <span className="tl-text">{bar.job.contactName}{bar.width >= 25 && ` · ${bar.late ? 'late' : bar.clash ? 'crew overlap' : durationLabel(bar.job)}`}</span>
                <span className="visually-hidden"> {humanize(bar.job.status)}</span>
                {bar.job.crew.length > 0 && bar.width > 22 && <AvatarStack names={bar.job.crew.map((member) => member.displayName)} size={24} />}
              </Link>
            </div>
          </li>)}
        </ul>
      </div>
      <div className={`tl-axis${period === 'day' ? '' : ' tl-axis--days'}`} aria-hidden="true">
        {range.ticks.map((tick) => <span key={tick.at} style={{ left: `${(tick.at - range.start) / (range.end - range.start) * 100}%` }}>{tick.label}</span>)}
      </div>
      <div className="tl-foot">
        <ul className="tl-legend" aria-label="Status colours">
          <li><i className="tl-key tl-bar--SCHEDULED" /> Scheduled</li>
          <li><i className="tl-key tl-bar--IN_PROGRESS" /> In progress</li>
          <li><i className="tl-key tl-bar--COMPLETED" /> Completed</li>
        </ul>
        <span className="tl-more">
          {hidden > 0 && <>{hidden} more this {period}. </>}
          {undated > 0 && bars.length > 0 && <>{undated} without a date. </>}
          {total > jobs.length && <>Showing the newest {jobs.length} of {total} jobs.</>}
        </span>
      </div>
    </div>}
  </section>;
}
