import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logoutResponseSchema } from '@sunshine/contracts';
import { apiPost, ApiRequestError } from '../lib/api';
import { sessionKey, useStaffSession } from '../features/auth/session';

export const workspaces = [
  ['sales', 'Sales'], ['orders', 'Orders'], ['warehouse', 'Warehouse'],
  ['field-service', 'Field & Service'], ['reports', 'Reports'],
] as const;

export function Workspace() {
  const session = useStaffSession();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const from = location.pathname + location.search;

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
      {workspaces.map(([path, label]) => <NavLink key={path} to={`/workspace/${path}`}>{label}</NavLink>)}
    </nav>
    <main id="workspace-content" tabIndex={-1}><Outlet /></main>
  </div>;
}

export function WorkspaceOverview() {
  return <><h1>Overview</h1><p>Choose a workspace to continue.</p><div className="workspace-cards">{workspaces.map(([path, label]) => <section key={path}><h2><Link to={`/workspace/${path}`}>{label}</Link></h2><p>Workflow screens are planned.</p></section>)}</div></>;
}

export function PlannedWorkspace({ title }: { title: string }) {
  return <><h1>{title}</h1><p>This workspace is planned. Business actions are not available yet.</p></>;
}
