import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logoutResponseSchema, type StaffRole } from '@sunshine/contracts';
import { apiPost, ApiRequestError } from '../lib/api';
import { WorkspaceBoundary } from '../components/shared/WorkspaceBoundary';
import { sessionKey, useStaffSession } from '../features/auth/session';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import './shell.css';

export const workspaces = [
  ['sales', 'CRM'], ['orders', 'Projects'], ['warehouse', 'Inventory'],
  ['field-service', 'Installations'], ['service', 'Service'], ['reports', 'Finance'],
] as const;

export const workspaceRoles: Record<string, readonly StaffRole[]> = {
  sales: ['ADMIN', 'SALES', 'TECHNICIAN'], orders: ['ADMIN', 'SALES', 'WAREHOUSE'],
  warehouse: ['ADMIN', 'WAREHOUSE'], 'field-service': ['ADMIN', 'TECHNICIAN'],
  service: ['ADMIN', 'SUPPORT'], reports: ['ADMIN'],
};
export function visibleWorkspaces(role: StaffRole) {
  return workspaces.filter(([path]) => (workspaceRoles[path]?.includes(role) ?? false));
}
/** A technician opens this area for their own site surveys, not for sales. */
export const workspaceLabel = (path: string, label: string, role: StaffRole) => path === 'sales' && role === 'TECHNICIAN' ? 'Surveys' : label;

export function Workspace() {
  const session = useStaffSession();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('solar-os:sidebar') === 'collapsed'; } catch { return false; } });
  const from = location.pathname + location.search;
  const content = useRef<HTMLElement>(null);
  // Moves keyboard focus without letting the browser scroll the header away; a new page still starts at its top.
  useEffect(() => { content.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [location.pathname, session.data?.id]);
  const area = location.pathname.split('/')[2];
  const allowed = !area || !workspaceRoles[area] || (session.data && workspaceRoles[area].includes(session.data.role));

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('solar-os:sidebar', next ? 'collapsed' : 'open'); } catch { /* Only a convenience. */ }
  }
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
  return <div className="app-frame" data-collapsed={collapsed}>
    <a className="skip-link" href="#workspace-content">Skip to content</a>
    <Sidebar staff={session.data} collapsed={collapsed} onToggle={toggleSidebar} onSignOut={() => void logout()} signingOut={pending} />
    <div className="app-page">
      <Topbar staff={session.data} area={area} onSignOut={() => void logout()} signingOut={pending} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <main ref={content} id="workspace-content" tabIndex={-1}>{allowed ? <WorkspaceBoundary key={location.pathname + location.search}><Outlet /></WorkspaceBoundary> : <section role="alert"><h1>Access unavailable</h1><p>Your role cannot open this workspace.</p><p><Link to="/workspace">Back to your overview</Link></p></section>}</main>
    </div>
  </div>;
}
