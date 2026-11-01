import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { JobView } from '@sunshine/contracts';
import { durationLabel, monthGrid, onDay, shiftAnchor } from '../dashboard/dashboard-model';
import { humanize } from '../sales/queries';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VISIBLE_JOBS = 3;
const pad = (value: number) => String(value).padStart(2, '0');

/** A month of real job dates. Each job opens its page, and colour always comes with words. */
export function JobCalendar({ jobs }: { jobs: JobView[] }) {
  const [now] = useState(() => new Date());
  const [anchor, setAnchor] = useState(now);
  const [expanded, setExpanded] = useState<number | null>(null);
  const byStart = useMemo(() => [...jobs].sort((a, b) => Date.parse(a.scheduledStart ?? '') - Date.parse(b.scheduledStart ?? '')), [jobs]);
  const days = useMemo(() => monthGrid(anchor).map((day) => ({ day, jobs: byStart.filter((job) => onDay(job, day)) })), [anchor, byStart]);
  const inMonth = days.filter(({ day, jobs: booked }) => day.getMonth() === anchor.getMonth() && booked.length > 0).length;
  const undated = jobs.filter((job) => job.status !== 'COMPLETED' && !job.scheduledStart).length;
  const go = (next: Date) => { setAnchor(next); setExpanded(null); };

  return <section className="pattern-card" aria-labelledby="calendar-title">
    <div className="cal-head">
      <h2 id="calendar-title" aria-live="polite">{anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
      <div className="date-nav">
        <button type="button" className="date-step" aria-label="Previous month" onClick={() => go(shiftAnchor('month', anchor, -1))}><ChevronLeft size="1rem" aria-hidden="true" /></button>
        <button type="button" className="date-step" aria-label="Next month" onClick={() => go(shiftAnchor('month', anchor, 1))}><ChevronRight size="1rem" aria-hidden="true" /></button>
        <button type="button" className="cal-today" onClick={() => go(now)}>Today</button>
      </div>
      <ul className="tl-legend" aria-label="Status colours">
        <li><i className="tl-key tl-bar--SCHEDULED" /> Scheduled</li>
        <li><i className="tl-key tl-bar--IN_PROGRESS" /> In progress</li>
        <li><i className="tl-key tl-bar--COMPLETED" /> Completed</li>
      </ul>
    </div>
    <div className="cal-week" aria-hidden="true">{WEEKDAYS.map((name) => <span key={name}>{name}</span>)}</div>
    <ol className="cal-grid">
      {days.map(({ day, jobs: booked }, index) => {
        const at = day.getTime(), open = expanded === at, shown = open ? booked : booked.slice(0, VISIBLE_JOBS), hidden = booked.length - shown.length;
        const label = `${WEEKDAYS[index % 7]} ${day.getDate()} ${day.toLocaleDateString('en-IN', { month: 'short' })}`;
        const classes = ['cal-day', day.getMonth() !== anchor.getMonth() && 'is-other', day.toDateString() === now.toDateString() && 'is-today', booked.length > 0 && 'has-jobs'].filter(Boolean).join(' ');
        return <li key={at} className={classes}>
          <time className="cal-date" dateTime={`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`} aria-label={label}><span className="cal-weekday" aria-hidden="true">{label}</span><span className="cal-number" aria-hidden="true">{day.getDate()}</span></time>
          {shown.map((job) => <Link key={job.id} className={`cal-job tl-bar--${job.status}`} to={`/workspace/field-service/jobs/${job.id}`} title={`${job.orderDisplayNumber}, ${job.contactName}, ${humanize(job.status)}, ${durationLabel(job)}`}>
            {job.contactName}<span className="visually-hidden">, {job.orderDisplayNumber}, {humanize(job.status)}</span>
          </Link>)}
          {hidden > 0 && <button type="button" className="cal-more" aria-label={`Show ${hidden} more on ${label}`} onClick={() => setExpanded(at)}>+{hidden} more</button>}
        </li>;
      })}
    </ol>
    {(inMonth === 0 || undated > 0) && <p className="panel-note cal-note">
      {inMonth === 0 && 'No installations this month. '}
      {undated > 0 && `${undated} ${undated === 1 ? 'job is' : 'jobs are'} still waiting for a date.`}
    </p>}
  </section>;
}
