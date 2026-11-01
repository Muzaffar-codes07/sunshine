import { Link, NavLink } from 'react-router-dom';
import { Banknote, Boxes, ClipboardList, FolderKanban, HardHat, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, SolarPanel, Users, UsersRound, Wrench, type LucideIcon } from 'lucide-react';
import type { StaffIdentity } from '@sunshine/contracts';
import { Avatar, BrandMark } from '../components/shared/Brand';
import { humanize } from '../features/sales/queries';
import { visibleWorkspaces, workspaceLabel } from './Workspace';

const ICONS: Record<string, LucideIcon> = { sales: Users, orders: FolderKanban, warehouse: Boxes, 'field-service': HardHat, service: Wrench, reports: Banknote, equipment: SolarPanel, team: UsersRound };

export function AccountChip({ staff, onSignOut, signingOut, className = '' }: { staff: StaffIdentity; onSignOut: () => void; signingOut: boolean; className?: string }) {
  return <div className={`account ${className}`}>
    <Avatar name={staff.displayName} size={44} />
    <span className="account-name">{staff.displayName}</span>
    <span className="account-role">{humanize(staff.role)}</span>
    <button type="button" className="icon-button" disabled={signingOut} aria-label={signingOut ? 'Signing out' : 'Sign out'} title="Sign out" onClick={onSignOut}><LogOut size="1rem" aria-hidden="true" /></button>
  </div>;
}

export function Sidebar({ staff, collapsed, onToggle, onSignOut, signingOut }: { staff: StaffIdentity; collapsed: boolean; onToggle: () => void; onSignOut: () => void; signingOut: boolean }) {
  return <aside className="sidebar">
    <Link className="side-brand" to="/workspace"><BrandMark /><span className="side-label">Solar OS</span></Link>
    <nav className="side-nav" aria-label="Staff workspaces">
      <NavLink to="/workspace" end><LayoutDashboard size="1.1875rem" strokeWidth={1.75} aria-hidden="true" /><span className="side-label">Overview</span></NavLink>
      {visibleWorkspaces(staff.role).map(([path, label]) => {
        const name = workspaceLabel(path, label, staff.role), Icon = name === 'Surveys' ? ClipboardList : ICONS[path] ?? LayoutDashboard;
        return <NavLink key={path} to={`/workspace/${path}`}><Icon size="1.1875rem" strokeWidth={1.75} aria-hidden="true" /><span className="side-label">{name}</span></NavLink>;
      })}
    </nav>
    <div className="side-foot">
      <AccountChip staff={staff} onSignOut={onSignOut} signingOut={signingOut} />
      <button type="button" className="side-collapse" aria-pressed={collapsed} aria-label="Collapse sidebar" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
        {collapsed ? <PanelLeftOpen size="1rem" aria-hidden="true" /> : <PanelLeftClose size="1rem" aria-hidden="true" />}
      </button>
    </div>
  </aside>;
}
