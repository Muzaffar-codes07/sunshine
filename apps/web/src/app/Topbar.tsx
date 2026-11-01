import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarCheck2, Plus, Search } from 'lucide-react';
import { enquiryListResponseSchema, unitLookupResponseSchema, unitDetailResponseSchema, type StaffIdentity, type StaffRole } from '@sunshine/contracts';
import { apiGet } from '../lib/api';
import { useDashboardJobs, useOpenTickets } from '../features/dashboard/dashboard-data';
import { attentionItems, onDay, projectHref } from '../features/dashboard/dashboard-model';
import { humanize } from '../features/sales/queries';
import { AccountChip } from './Sidebar';
import { workspaceLabel, workspaces } from './Workspace';

function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open, close, root]);
}

type Result = { id: string; title: string; detail: string; href: string };

/** Searches what this role can already read. Serial numbers come from the stock API; the rest filter the lists the API returned. */
function GlobalSearch({ role }: { role: StaffRole }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(open, close, root);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); } };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  const term = text.trim().toLowerCase(), active = term.length >= 2;
  const jobs = useDashboardJobs(role);
  const tickets = useOpenTickets(role);
  const enquiries = useQuery({
    queryKey: ['search', 'enquiries'], enabled: active && (role === 'ADMIN' || role === 'SALES'), staleTime: 30_000,
    queryFn: ({ signal }) => apiGet('/enquiries?pageSize=100', enquiryListResponseSchema, signal),
  });
  const units = useQuery({
    queryKey: ['search', 'units', term], enabled: term.length >= 3 && (role === 'ADMIN' || role === 'WAREHOUSE'), retry: false,
    queryFn: async ({ signal }) => {
      const found = (await apiGet(`/units?serial=${encodeURIComponent(text.trim())}`, unitLookupResponseSchema, signal)).data.slice(0, 3);
      return Promise.all(found.map(async (unit) => (await apiGet(`/units/${unit.id}`, unitDetailResponseSchema, signal)).data));
    },
  });
  const groups: { title: string; items: Result[] }[] = !active ? [] : [
    { title: 'Projects', items: (jobs.data?.items ?? []).filter((job) => `${job.orderDisplayNumber} ${job.contactName} ${job.siteAddress}`.toLowerCase().includes(term)).slice(0, 5).map((job) => ({ id: job.id, title: `${job.orderDisplayNumber} · ${job.contactName}`, detail: job.siteAddress, href: projectHref(job, role) })) },
    { title: 'Customers', items: (enquiries.data?.data.items ?? []).filter((item) => `${item.contactName} ${item.phone}`.toLowerCase().includes(term)).slice(0, 5).map((item) => ({ id: item.id, title: item.contactName, detail: `${item.siteCity} · ${humanize(item.status)}`, href: `/workspace/sales/enquiries/${item.id}` })) },
    { title: 'Serial numbers', items: (units.data ?? []).map((unit) => ({ id: unit.id, title: unit.serial, detail: humanize(unit.status), href: unit.activeAssignment ? `/workspace/warehouse/orders/${unit.activeAssignment.orderId}` : '/workspace/warehouse' })) },
    { title: 'Service tickets', items: (tickets.data?.items ?? []).filter((ticket) => `${ticket.ticketNumber} ${ticket.faultDescription}`.toLowerCase().includes(term)).slice(0, 5).map((ticket) => ({ id: ticket.id, title: ticket.ticketNumber, detail: ticket.faultDescription, href: `/workspace/service?ticket=${ticket.id}` })) },
  ].filter((group) => group.items.length > 0);
  return <div className="search" ref={root} role="search">
    <div className="search-box">
      <span className="pill-icon" aria-hidden="true"><Search size="1rem" /></span>
      <input ref={input} type="search" aria-label="Search projects, customers and serial numbers" placeholder="Search projects, customers, serials…" value={text} onChange={(event) => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
    </div>
    {open && active && <div className="popover">
      {groups.map((group) => <div key={group.title}><p className="popover-title">{group.title}</p><ul>{group.items.map((item) => <li key={item.id}><Link to={item.href} onClick={() => { setOpen(false); setText(''); }}>{item.title}<small>{item.detail}</small></Link></li>)}</ul></div>)}
      {groups.length === 0 && <p className="popover-empty" role="status">{jobs.isFetching || enquiries.isFetching || units.isFetching ? 'Searching…' : 'No matches.'}</p>}
    </div>}
  </div>;
}

function AttentionMenu({ role }: { role: StaffRole }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(open, close, root);
  const jobs = useDashboardJobs(role);
  const tickets = useOpenTickets(role);
  const items = [
    ...attentionItems(jobs.data?.items ?? [], role, new Date()),
    ...(tickets.data?.items ?? []).filter((ticket) => ticket.status === 'OPEN').slice(0, 5).map((ticket) => ({ id: ticket.id, title: `${ticket.ticketNumber} is waiting for assessment`, detail: ticket.faultDescription, href: `/workspace/service?ticket=${ticket.id}` })),
  ];
  return <div className="menu" ref={root}>
    <button type="button" className="bell" aria-haspopup="true" aria-expanded={open} aria-label={`Needs attention: ${items.length}`} onClick={() => setOpen(!open)}>
      <Bell size="1.125rem" aria-hidden="true" />{items.length > 0 && <span className="bell-count" aria-hidden="true">{items.length > 9 ? '9+' : items.length}</span>}
    </button>
    {open && <div className="popover">
      <p className="popover-title">Needs attention</p>
      {items.length === 0 ? <p className="popover-empty">Nothing needs attention.</p> : <ul>{items.slice(0, 12).map((item) => <li key={item.id}><Link to={item.href} onClick={() => setOpen(false)}>{item.title}<small>{item.detail}</small></Link></li>)}</ul>}
    </div>}
  </div>;
}

export function Topbar({ staff, area, onSignOut, signingOut }: { staff: StaffIdentity; area?: string; onSignOut: () => void; signingOut: boolean }) {
  const role = staff.role;
  const jobs = useDashboardJobs(role);
  const today = (jobs.data?.items ?? []).filter((job) => job.status !== 'COMPLETED' && onDay(job, new Date())).length;
  const entry = workspaces.find(([path]) => path === area);
  const todayPill = <><span className="pill-icon" aria-hidden="true"><CalendarCheck2 size="1rem" /></span><span className="pill-count">{today}</span><span className="pill-text">Today's installations</span></>;
  return <header className="topbar">
    {area
      ? <p className="crumb">Solar OS / <strong>{entry ? workspaceLabel(entry[0], entry[1], role) : 'Page'}</strong></p>
      : <h1 className="topbar-title"><span>Solar OS /</span> Overview</h1>}
    <div className="top-actions">
      {(role === 'ADMIN' || role === 'SALES') && <Link className="pill pill--new" to="/enquire"><span className="pill-icon" aria-hidden="true"><Plus size="1.125rem" /></span><span className="pill-text">New project</span></Link>}
      {role !== 'SUPPORT' && (role === 'ADMIN' || role === 'TECHNICIAN'
        ? <Link className="pill pill--today" to="/workspace/field-service">{todayPill}</Link>
        : <span className="pill pill--today">{todayPill}</span>)}
      <GlobalSearch role={role} />
      <AttentionMenu role={role} />
      <AccountChip className="account--top" staff={staff} onSignOut={onSignOut} signingOut={signingOut} />
    </div>
  </header>;
}
