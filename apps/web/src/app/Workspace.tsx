import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logoutResponseSchema, type StaffRole } from '@sunshine/contracts';
import { apiPost, ApiRequestError } from '../lib/api';
import { WorkspaceBoundary } from '../components/shared/WorkspaceBoundary';
import { sessionKey, useStaffSession } from '../features/auth/session';

export const workspaces = [
  ['sales', 'Sales'], ['orders', 'Orders'], ['warehouse', 'Warehouse'],
  ['field-service', 'Field jobs'], ['service', 'Warranty & service'], ['reports', 'Reports'],
] as const;

export const workspaceRoles: Record<string, readonly StaffRole[]> = {
  sales: ['ADMIN', 'SALES', 'TECHNICIAN'], orders: ['ADMIN', 'SALES', 'WAREHOUSE'],
  warehouse: ['ADMIN', 'WAREHOUSE'], 'field-service': ['ADMIN', 'TECHNICIAN'],
  service: ['ADMIN', 'SUPPORT'], reports: ['ADMIN'],
};
export function visibleWorkspaces(role: StaffRole) {
  return workspaces.filter(([path]) => (workspaceRoles[path]?.includes(role) ?? false));
}
const descriptions: Record<string, string> = {
  sales: 'Enquiries, assigned surveys and quotations.', orders: 'Confirmed orders, invoices, receipts and crew scheduling.',
  warehouse: 'Receive stock, inspect the ledger and fulfil orders.', 'field-service': 'Assigned jobs, installation photos and customer acceptance.',
  service: 'Equipment coverage and repair records. Some actions await backend integration.',
  reports: 'Posted revenue, costs and operational queues. Pay and subsidy actions await integration.',
};

export function Workspace() {
  const session = useStaffSession();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const from = location.pathname + location.search;
  const content = useRef<HTMLElement>(null);
  useEffect(() => { content.current?.focus(); }, [location.pathname, location.search, session.data?.id]);
  const area = location.pathname.split('/')[2];
  const allowed = !area || !workspaceRoles[area] || (session.data && workspaceRoles[area].includes(session.data.role));

  async function logout() {
    if (pending) return;
    setPending(true); setError('');
    try {
      try { await apiPost('/auth/logout', logoutResponseSchema); }
      catch (failure) { if (!(failure instanceof ApiRequestError && failure.status === 401)) throw failure; }
      await client.cancelQueries();
      client.clear(); client.setQueryData(sessionKey, null);
      navigate('/login', { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out. Try again.');
    } finally { setPending(false); }
  }

  if (session.isPending) return <main className="enquiry-page" role="status">Checking your session…</main>;
  if (session.isError) return <main className="enquiry-page"><h1>Unable to check session</h1><p role="alert">{session.error.message}</p><button onClick={() => void session.refetch()}>Retry</button><p><Link to="/login">Go to sign in</Link></p></main>;
  if (!session.data) return <Navigate to="/login" state={{ from }} replace />;
  return <div className="staff-shell">
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    <header className="staff-header"><Link className="brand" to="/workspace"><span className="sun" aria-hidden="true">☀</span> sunshine</Link>
      <div className="staff-account"><span>{session.data.displayName} · {session.data.role}</span><button disabled={pending} onClick={() => void logout()}>{pending ? 'Signing out…' : 'Sign out'}</button></div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <nav className="workspace-nav" aria-label="Staff workspaces">
      <NavLink to="/workspace" end>Overview</NavLink>
      {visibleWorkspaces(session.data.role).map(([path, label]) => <NavLink key={path} to={`/workspace/${path}`}>{label}</NavLink>)}
    </nav>
    <main ref={content} id="workspace-content" tabIndex={-1}>{allowed ? <WorkspaceBoundary key={location.pathname + location.search}><Outlet /></WorkspaceBoundary> : <section role="alert"><h1>Access unavailable</h1><p>Your role cannot open this workspace.</p><Link to="/workspace">Choose an available workspace</Link></section>}</main>
  </div>;
}

export function WorkspaceOverview() {
  const session = useStaffSession();
  if (!session.data) return null;
  return <><h1>Your workspace</h1><p>Signed in as {session.data.displayName}. Choose the next step for your role.</p><div className="workspace-cards">{visibleWorkspaces(session.data.role).map(([path, label]) => <section key={path}><h2><Link to={`/workspace/${path}`}>{label}</Link></h2><p>{descriptions[path]}</p></section>)}</div></>;
}
