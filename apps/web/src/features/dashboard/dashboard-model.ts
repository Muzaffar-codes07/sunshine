import type { JobView, StaffRole } from '@sunshine/contracts';

/** Display arithmetic only: grouping and counting records the API returned. Money and stock totals come from the API. */
export type Period = 'day' | 'week' | 'month';
export type Tick = { at: number; label: string };
export type Range = { start: number; end: number; ticks: Tick[]; title: string };
export type Bar = { job: JobView; left: number; width: number; late: boolean; clash: boolean };

const HOUR = 3_600_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const windowOf = (job: JobView) => job.scheduledStart && job.scheduledFinish ? { start: Date.parse(job.scheduledStart), end: Date.parse(job.scheduledFinish) } : null;
const dayStart = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate());
const addDays = (at: Date, days: number) => new Date(at.getFullYear(), at.getMonth(), at.getDate() + days);
const weekStart = (at: Date) => addDays(dayStart(at), -((at.getDay() + 6) % 7));
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 || hour === 24 ? 'AM' : 'PM'}`;

/** A day stretches past 8 AM to 6 PM only when a job needs it, so normal days stay readable. */
export function rangeFor(period: Period, anchor: Date, jobs: JobView[]): Range {
  if (period === 'day') {
    const base = dayStart(anchor).getTime(), next = addDays(anchor, 1).getTime();
    let from = 8, to = 18;
    for (const job of jobs) {
      const span = windowOf(job);
      if (!span || span.end <= base || span.start >= next) continue;
      from = Math.min(from, Math.floor(Math.max(span.start - base, 0) / HOUR));
      to = Math.max(to, Math.ceil(Math.min(span.end - base, next - base) / HOUR));
    }
    from -= from % 2; to += to % 2;
    const ticks: Tick[] = [];
    for (let hour = from; hour <= to; hour += 2) ticks.push({ at: base + hour * HOUR, label: hourLabel(hour) });
    return { start: base + from * HOUR, end: base + to * HOUR, ticks, title: `${MONTHS[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}` };
  }
  if (period === 'week') {
    const first = weekStart(anchor), last = addDays(first, 6);
    const ticks = DAYS.map((label, index) => { const at = addDays(first, index); return { at: at.getTime(), label: `${label} ${at.getDate()}` }; });
    return { start: first.getTime(), end: addDays(first, 7).getTime(), ticks, title: `${MONTHS[first.getMonth()]} ${first.getDate()} – ${MONTHS[last.getMonth()]} ${last.getDate()}` };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1), next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const ticks = [1, 8, 15, 22, 29].map((day) => ({ at: new Date(anchor.getFullYear(), anchor.getMonth(), day).getTime(), label: `${MONTHS[anchor.getMonth()]} ${day}` }));
  return { start: first.getTime(), end: next.getTime(), ticks, title: `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}` };
}

export function shiftAnchor(period: Period, anchor: Date, direction: 1 | -1): Date {
  if (period === 'day') return addDays(anchor, direction);
  if (period === 'week') return addDays(anchor, 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

export const isLate = (job: JobView, now: number) => job.status !== 'COMPLETED' && !!job.scheduledFinish && Date.parse(job.scheduledFinish) < now;

/** The same technician on two open jobs at once. */
export function hasClash(job: JobView, jobs: JobView[]) {
  const span = windowOf(job);
  if (!span || job.status === 'COMPLETED') return false;
  return jobs.some((other) => {
    const window = windowOf(other);
    return other.id !== job.id && other.status !== 'COMPLETED' && window && window.start < span.end && span.start < window.end
      && other.technicianIds.some((id) => job.technicianIds.includes(id));
  });
}

/** A day view is to the hour. Week and month views show whole days, because a six-hour job would otherwise be a speck. */
export function barsFor(jobs: JobView[], range: Range, now: number, period: Period = 'day'): Bar[] {
  const size = range.end - range.start, whole = period !== 'day', least = whole ? 14.2 : 7;
  return jobs.flatMap((job) => {
    const span = windowOf(job);
    if (!span || span.end <= range.start || span.start >= range.end) return [];
    const from = Math.max(whole ? dayStart(new Date(span.start)).getTime() : span.start, range.start);
    const to = Math.min(whole ? addDays(new Date(span.end - 1), 1).getTime() : span.end, range.end);
    const width = Math.max((to - from) / size * 100, least);
    return [{ job, left: Math.min((from - range.start) / size * 100, 100 - width), width, late: isLate(job, now), clash: hasClash(job, jobs) }];
  }).sort((a, b) => Date.parse(a.job.scheduledStart!) - Date.parse(b.job.scheduledStart!));
}

export function durationLabel(job: JobView) {
  const span = windowOf(job);
  if (!span) return '';
  const hours = Math.round((span.end - span.start) / HOUR);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export const onDay = (job: JobView, day: Date) => {
  const span = windowOf(job), start = dayStart(day).getTime(), end = addDays(day, 1).getTime();
  return !!span && span.start < end && span.end > start;
};

/** Work on site first, then whatever is late, then the next job due. A finished job only shows when nothing is open. */
export function pickSpotlight(jobs: JobView[], now: number): JobView | null {
  const soonest = (list: JobView[]) => [...list].sort((a, b) => Date.parse(a.scheduledStart ?? '9999') - Date.parse(b.scheduledStart ?? '9999'))[0];
  const open = jobs.filter((job) => job.status !== 'COMPLETED');
  return soonest(open.filter((job) => job.status === 'IN_PROGRESS')) ?? soonest(open.filter((job) => isLate(job, now))) ?? soonest(open)
    ?? [...jobs].sort((a, b) => Date.parse(b.finishedAt ?? '0') - Date.parse(a.finishedAt ?? '0'))[0] ?? null;
}

export function performance(jobs: JobView[], nowAt: Date, weeks = 8) {
  const first = weekStart(addDays(nowAt, -7 * (weeks - 1))).getTime();
  const completed = Array<number>(weeks).fill(0), started = Array<number>(weeks).fill(0);
  const slot = (iso: string | null) => iso ? Math.floor((Date.parse(iso) - first) / (7 * 24 * HOUR)) : -1;
  const thisMonth = new Date(nowAt.getFullYear(), nowAt.getMonth(), 1).getTime(), lastMonth = new Date(nowAt.getFullYear(), nowAt.getMonth() - 1, 1).getTime();
  let doneThisMonth = 0, doneLastMonth = 0;
  for (const job of jobs) {
    const done = slot(job.finishedAt), begun = slot(job.startedAt);
    if (done >= 0 && done < weeks) completed[done]! += 1;
    if (begun >= 0 && begun < weeks) started[begun]! += 1;
    const finished = job.finishedAt ? Date.parse(job.finishedAt) : 0;
    if (finished >= thisMonth) doneThisMonth += 1;
    else if (finished >= lastMonth) doneLastMonth += 1;
  }
  const count = (status: JobView['status']) => jobs.filter((job) => job.status === status).length;
  return { active: count('SCHEDULED') + count('IN_PROGRESS'), scheduled: count('SCHEDULED'), inProgress: count('IN_PROGRESS'), completed: count('COMPLETED'), doneThisMonth, doneLastMonth, completedByWeek: completed, startedByWeek: started };
}

export function teamFacts(jobs: JobView[], nowAt: Date) {
  const open = jobs.filter((job) => job.status !== 'COMPLETED');
  const names = new Map(jobs.flatMap((job) => job.crew.map((member) => [member.id, member.displayName] as const)));
  const today = open.filter((job) => onDay(job, nowAt));
  const assignedToday = [...new Set(today.flatMap((job) => job.technicianIds))];
  const onSite = [...new Set(open.filter((job) => job.status === 'IN_PROGRESS').flatMap((job) => job.technicianIds))];
  const days = Array.from({ length: 7 }, (_, index) => { const day = addDays(nowAt, index); return { label: DAYS[(day.getDay() + 6) % 7]!, count: jobs.filter((job) => onDay(job, day)).length }; });
  const start = weekStart(nowAt), thisWeek = jobs.filter((job) => [0, 1, 2, 3, 4, 5, 6].some((index) => onDay(job, addDays(start, index))));
  return {
    knownCrew: [...names.values()], assignedToday: assignedToday.map((id) => names.get(id) ?? 'Technician'), onSite: onSite.map((id) => names.get(id) ?? 'Technician'),
    noCrew: open.filter((job) => job.status === 'SCHEDULED' && job.technicianIds.length === 0), noDate: open.filter((job) => !job.scheduledStart),
    days, weekTotal: thisWeek.length, weekDone: thisWeek.filter((job) => job.status === 'COMPLETED').length,
    weekCrew: [...new Set(thisWeek.flatMap((job) => job.crew.map((member) => member.displayName)))],
  };
}

export function projectHref(job: Pick<JobView, 'id' | 'orderId'>, role: StaffRole) {
  if (role === 'ADMIN' || role === 'TECHNICIAN') return `/workspace/field-service/jobs/${job.id}`;
  if (role === 'WAREHOUSE') return `/workspace/warehouse/orders/${job.orderId}`;
  return `/workspace/orders/${job.orderId}`;
}

export type JobFilter = 'ALL' | JobView['status'];

/** Filter options with live counts. A status with no jobs drops out, so nobody picks an empty list. */
export function statusFilters(jobs: JobView[]): { id: JobFilter; label: string; count: number }[] {
  const rows: { id: JobView['status']; label: string }[] = [{ id: 'SCHEDULED', label: 'Scheduled' }, { id: 'IN_PROGRESS', label: 'In progress' }, { id: 'COMPLETED', label: 'Completed' }];
  return [{ id: 'ALL', label: 'All', count: jobs.length }, ...rows.map((row) => ({ ...row, count: jobs.filter((job) => job.status === row.id).length })).filter((row) => row.count > 0)];
}

export type DocumentRow = { id: string; name: string; detail: string; status: string; href: string };

/** Every row opens the real record holding that document. Nothing here is listed without one behind it. */
export function documentRows(jobs: JobView[], role: StaffRole, approvals: DocumentRow[] = []): DocumentRow[] {
  const newest = (list: JobView[], field: 'finishedAt' | 'scheduledStart') => [...list].sort((a, b) => Date.parse(b[field] ?? '0') - Date.parse(a[field] ?? '0'));
  const done = newest(jobs.filter((job) => job.status === 'COMPLETED'), 'finishedAt'), open = newest(jobs.filter((job) => job.status !== 'COMPLETED'), 'scheduledStart');
  if (role === 'WAREHOUSE') return [...open.filter((job) => job.status === 'IN_PROGRESS'), ...done].slice(0, 4).map((job) => ({ id: `cover-${job.id}`, name: 'Warranty cover', detail: job.orderDisplayNumber, status: 'Delivered', href: `/workspace/warehouse/orders/${job.orderId}` }));
  if (role === 'TECHNICIAN') return open.slice(0, 4).map((job) => ({ id: `check-${job.id}`, name: 'Installation checklist', detail: job.orderDisplayNumber, status: job.status === 'IN_PROGRESS' ? 'In progress' : 'To do', href: `/workspace/field-service/jobs/${job.id}` }));
  const handovers = done.slice(0, 2).map((job) => ({ id: `handover-${job.id}`, name: 'Customer handover', detail: `${job.orderDisplayNumber} · ${job.contactName}`, status: 'Signed', href: projectHref(job, role) }));
  const invoices = [...done, ...open].map((job) => ({ id: `invoice-${job.id}`, name: 'Order and invoice', detail: `${job.orderDisplayNumber} · ${job.contactName}`, status: 'Open', href: `/workspace/orders/${job.orderId}` }));
  return [...approvals, ...handovers, ...invoices].slice(0, 4);
}

export type AttentionItem = { id: string; title: string; detail: string; href: string };

export function attentionItems(jobs: JobView[], role: StaffRole, nowAt: Date): AttentionItem[] {
  const now = nowAt.getTime(), schedule = (job: JobView) => role === 'WAREHOUSE' ? projectHref(job, role) : `/workspace/orders/${job.orderId}`;
  const items: AttentionItem[] = [];
  for (const job of jobs) {
    if (job.status === 'COMPLETED') continue;
    if (role === 'TECHNICIAN') { if (onDay(job, nowAt)) items.push({ id: `today-${job.id}`, title: `${job.orderDisplayNumber} is scheduled today`, detail: job.siteAddress, href: projectHref(job, role) }); continue; }
    if (isLate(job, now)) items.push({ id: `late-${job.id}`, title: `${job.orderDisplayNumber} is past its finish time`, detail: job.contactName, href: projectHref(job, role) });
    if (role === 'WAREHOUSE') continue;
    if (!job.scheduledStart) items.push({ id: `date-${job.id}`, title: `${job.orderDisplayNumber} has no date or crew`, detail: job.contactName, href: schedule(job) });
    else if (job.technicianIds.length === 0) items.push({ id: `crew-${job.id}`, title: `${job.orderDisplayNumber} has no crew`, detail: job.contactName, href: schedule(job) });
  }
  return items;
}

/** A smooth line through evenly spaced values, for the small trend charts. */
export function linePath(values: number[], width: number, height: number, pad = 4) {
  if (values.length < 2) return '';
  const top = Math.max(...values, 1), step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - pad - value / top * (height - pad * 2)] as const);
  return points.map(([x, y], index) => {
    if (index === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const [px, py] = points[index - 1]!, mid = (px + x) / 2;
    return `C${mid.toFixed(1)} ${py.toFixed(1)} ${mid.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export function formatInr(amount: string) {
  const value = Number(amount);
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2, minimumFractionDigits: Number.isInteger(value) ? 0 : 2 })}`;
}

/** A calendar date such as a warranty start, shown the same way in every timezone. */
export const formatDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
