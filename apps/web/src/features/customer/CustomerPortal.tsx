import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { customerLoginSchema, customerPortalResponseSchema, customerProfileResponseSchema, customerProfileUpdateSchema, customerRegisterSchema, customerRegistrationResponseSchema, customerVerifySchema, logoutResponseSchema, type CustomerPortal } from '@sunshine/contracts';
import { BrandMark } from '../../components/shared/Brand';
import { apiGet, apiPatch, apiPost, ApiRequestError } from '../../lib/api';
import './customer.css';

const sessionKey = ['customer-session'] as const;
const portalKey = ['customer-portal'] as const;
const pages = [
  ['overview', 'Overview'], ['projects', 'My projects'], ['quotes', 'Quotes'], ['invoices', 'Invoices'],
  ['equipment', 'Equipment & warranty'], ['service', 'Service history'], ['documents', 'Documents'], ['profile', 'Profile'],
] as const;

function useCustomerSession() {
  return useQuery({ queryKey: sessionKey, queryFn: async ({ signal }) => {
    try { return (await apiGet('/customer/auth/me', customerProfileResponseSchema, signal)).data; }
    catch (error) { if (error instanceof ApiRequestError && error.status === 401) return null; throw error; }
  }, retry: false, staleTime: 0, refetchOnWindowFocus: true });
}

function AccessFrame({ children }: { children: React.ReactNode }) {
  return <main className="customer-access"><div className="customer-access-card">
    <Link to="/" className="customer-brand"><BrandMark /> Solar OS</Link>
    {children}
  </div></main>;
}

export function CustomerLoginPage() {
  const session = useCustomerSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const fields = new FormData(event.currentTarget);
    const input = customerLoginSchema.safeParse({ email: fields.get('email'), password: fields.get('password') });
    if (!input.success) { setError('Enter a valid email and password.'); return; }
    setBusy(true);
    try {
      const result = await apiPost('/customer/auth/login', customerProfileResponseSchema, input.data);
      await client.cancelQueries(); client.clear(); client.setQueryData(sessionKey, result.data);
      navigate('/customer/portal', { replace: true });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  }
  if (session.data) return <Navigate to="/customer/portal" replace />;
  return <AccessFrame><h1>Customer sign in</h1><p>See your solar project from enquiry through service.</p>
    <form onSubmit={event => void submit(event)}><label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>
    {error && <p role="alert" className="customer-error">{error}</p>}
    <p>New customer? <Link to="/customer/register">Create your account</Link></p>
    <p><Link to="/login">Staff sign in</Link></p>
  </AccessFrame>;
}

export function CustomerRegisterPage() {
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const fields = new FormData(event.currentTarget);
    const input = customerRegisterSchema.safeParse({ email: fields.get('email'), password: fields.get('password') });
    if (!input.success) { setError('Use a valid email and a password of 12–200 characters.'); return; }
    if (fields.get('password') !== fields.get('confirm')) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { await apiPost('/customer/auth/register', customerRegistrationResponseSchema, input.data); setSent(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to register.'); }
    finally { setBusy(false); }
  }
  return <AccessFrame><h1>Create a customer account</h1><p>Use the email already recorded on your solar enquiry. We will send a verification link before you can sign in.</p>
    {sent ? <p role="status">If this email belongs to a customer, a verification link has been sent. Check your inbox.</p> :
      <form onSubmit={event => void submit(event)}><label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
        <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} required /></label>
        <button disabled={busy}>{busy ? 'Sending link…' : 'Create account'}</button></form>}
    {error && <p role="alert" className="customer-error">{error}</p>}
    <p>Have an account? <Link to="/customer/login">Sign in</Link></p>
    <p>Haven't enquired yet? <Link to="/enquire">Make an enquiry</Link></p>
  </AccessFrame>;
}

export function CustomerVerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function verify() {
    const input = customerVerifySchema.safeParse({ token });
    if (!input.success) { setError('This verification link is invalid.'); return; }
    setBusy(true); setError('');
    try { const result = await apiPost('/customer/auth/verify', customerRegistrationResponseSchema, input.data); setMessage(result.data.message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to verify email.'); }
    finally { setBusy(false); }
  }
  return <AccessFrame><h1>Verify your email</h1><p>Confirm this address to unlock your customer account.</p>
    {!message && <button disabled={busy || !token} onClick={() => void verify()}>{busy ? 'Verifying…' : 'Verify email'}</button>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="customer-error">{error}</p>}
    <p><Link to="/customer/login">Go to customer sign in</Link></p>
  </AccessFrame>;
}

export function CustomerPortalPage() {
  const { section = 'overview' } = useParams();
  const session = useCustomerSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const portal = useQuery({ queryKey: portalKey, queryFn: ({ signal }) => apiGet('/customer/portal', customerPortalResponseSchema, signal), enabled: !!session.data });
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try { await apiPost('/customer/auth/logout', logoutResponseSchema); }
    finally { await client.cancelQueries(); client.clear(); navigate('/customer/login', { replace: true }); setSigningOut(false); }
  }
  if (session.isPending) return <AccessFrame><p role="status">Checking your session…</p></AccessFrame>;
  if (session.isError) return <AccessFrame><h1>Session unavailable</h1><p role="alert">{session.error.message}</p><button onClick={() => void session.refetch()}>Retry</button></AccessFrame>;
  if (!session.data) return <Navigate to="/customer/login" replace />;
  if (!pages.some(([path]) => path === section)) return <Navigate to="/customer/portal" replace />;
  return <div className="customer-shell"><a className="skip-link" href="#customer-content">Skip to content</a>
    <header className="customer-header"><Link to="/customer/portal" className="customer-brand"><BrandMark /> Solar OS <span>My solar</span></Link>
      <div><span>{session.data.name}</span><button type="button" disabled={signingOut} onClick={() => void signOut()}>Sign out</button></div></header>
    <nav className="customer-nav" aria-label="Customer pages">{pages.map(([path, label]) => <NavLink key={path} to={path === 'overview' ? '/customer/portal' : `/customer/portal/${path}`} end>{label}</NavLink>)}</nav>
    <main id="customer-content" tabIndex={-1}>
      {portal.isPending ? <p role="status">Loading your records…</p> : portal.isError ? <div role="alert"><p>{portal.error.message}</p><button onClick={() => void portal.refetch()}>Retry</button></div> :
        <CustomerSection section={section} data={portal.data.data} onProfileSaved={async () => { await client.invalidateQueries({ queryKey: portalKey }); await client.invalidateQueries({ queryKey: sessionKey }); }} />}
    </main>
  </div>;
}

const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';
const money = (value: string) => `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const title = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, first => first.toUpperCase());
const empty = (message: string) => <p className="customer-empty">{message}</p>;

function CustomerSection({ section, data, onProfileSaved }: { section: string; data: CustomerPortal; onProfileSaved: () => Promise<void> }) {
  if (section === 'overview') return <><h1>Welcome, {data.profile.name}</h1><p>All the latest on your solar journey in one place.</p>
    <div className="customer-grid"><article><h2>Projects</h2><strong>{data.projects.length}</strong><Link to="/customer/portal/projects">See progress</Link></article>
      <article><h2>Latest enquiry</h2><strong>{data.enquiries[0] ? title(data.enquiries[0].status) : 'None yet'}</strong><Link to="/customer/portal/projects">See details</Link></article>
      <article><h2>Service tickets</h2><strong>{data.tickets.length}</strong><Link to="/customer/portal/service">View history</Link></article></div>
    <h2>Recent project</h2>{data.projects[0] ? <p>{data.projects[0].number} · {data.projects[0].jobStatus ? title(data.projects[0].jobStatus) : 'Confirmed'}</p> : empty('Your confirmed projects will appear here.')}
  </>;
  if (section === 'projects') return <><h1>My projects</h1><p>Your enquiries, orders, delivery, and installation progress.</p>
    <h2>Enquiries</h2>{data.enquiries.length ? <div className="customer-list">{data.enquiries.map(item => <article key={item.id}><h3>{item.requestedCapacityKw} kW enquiry</h3><p>{title(item.status)} · {date(item.createdAt)} · {item.systemType ? title(item.systemType) : 'System to be decided'}</p><p>Subsidy interest: {item.subsidyInterest ? 'Yes' : 'No'}</p></article>)}</div> : empty('No enquiries yet.')}
    <h2>Orders and installations</h2>{data.projects.length ? <div className="customer-list">{data.projects.map(item => <article key={item.id}><h3>{item.number}</h3><p>Confirmed {date(item.confirmedAt)}</p><p>Delivery: {item.deliveredAt ? date(item.deliveredAt) : item.dispatchStatus ? title(item.dispatchStatus) : 'Pending'}</p><p>Installation: {item.jobStatus ? title(item.jobStatus) : 'Pending'} · {item.completedAt ? `Completed ${date(item.completedAt)}` : `Scheduled ${date(item.scheduledStart)}`}</p></article>)}</div> : empty('No confirmed orders yet.')}</>;
  if (section === 'quotes') return <><h1>Quotes</h1><p>Quotes that have been sent to you and their recorded status.</p>{data.quotes.length ? <div className="customer-list">{data.quotes.map(item => <article key={item.id}><h2>Revision {item.revision} · {money(item.totalPrice)}</h2><p>{title(item.status)} · Sent {date(item.sentAt)}</p><ul>{item.lines.map((line, index) => <li key={index}>{line.description} · {line.quantity} · {money(line.lineTotal)}</li>)}</ul></article>)}</div> : empty('No sent quotes yet.')}</>;
  if (section === 'invoices') return <><h1>Invoices</h1><p>Read-only invoice and payment status. Payments are recorded by staff outside this portal.</p>{data.invoices.length ? <div className="customer-list">{data.invoices.map(item => <article key={item.id}><h2>{item.number} · {money(item.total)}</h2><p>{title(item.kind)} · {title(item.status)} · {date(item.postedAt)}</p><p>Paid: {money(item.paidAmount)} · Balance: {money(String(Number(item.total) - Number(item.paidAmount)))}</p><ul>{item.lines.map((line, index) => <li key={index}>{line.description} · {line.quantity} · {money(line.lineTotal)}</li>)}</ul></article>)}</div> : empty('No invoices yet.')}</>;
  if (section === 'equipment') return <><h1>Equipment & warranty</h1><p>Delivered equipment and its recorded coverage.</p>{data.equipment.length ? <div className="customer-list">{data.equipment.map(item => <article key={item.id}><h2>{item.product}</h2><p>{item.manufacturer} · Serial {item.serial}</p>{item.warranty ? <><p>{item.warranty.policyName} · {item.warranty.active ? 'Active policy' : 'Voided policy'}</p><p>From {item.warranty.startDate} to {item.warranty.expiryDate} (expiry date excluded)</p><p>{item.warranty.scope}</p></> : <p>Warranty details unavailable.</p>}</article>)}</div> : empty('Delivered equipment will appear here.')}</>;
  if (section === 'service') return <><h1>Service history</h1><p>Progress on service tickets recorded by the support team.</p>{data.tickets.length ? <div className="customer-list">{data.tickets.map(item => <article key={item.id}><h2>{item.number} · {title(item.status)}</h2><p>{item.faultDescription}</p><p>Opened {date(item.createdAt)}{item.closedAt ? ` · Closed ${date(item.closedAt)}` : item.resolvedAt ? ` · Resolved ${date(item.resolvedAt)}` : ''}</p></article>)}</div> : empty('No service tickets yet.')}</>;
  if (section === 'documents') return <><h1>Documents</h1><p>Installation photos and signed evidence attached to your projects. Quotes and invoices are shown in their own pages.</p>{data.documents.length ? <div className="customer-list">{data.documents.map(item => <article key={item.id}><h2>{item.name}</h2><p>{item.kind} · {date(item.createdAt)}</p><a href={`/api/v1/customer/documents/${item.id}`}>Download</a></article>)}</div> : empty('No installation documents yet.')}</>;
  return <CustomerProfile data={data} onSaved={onProfileSaved} />;
}

function CustomerProfile({ data, onSaved }: { data: CustomerPortal; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const profile = data.profile;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = customerProfileUpdateSchema.safeParse(Object.fromEntries(['phone', 'email', 'addressLine', 'city', 'pincode', 'currentPassword'].map(key => [key, fields.get(key)])));
    if (!input.success) { setError('Check your contact details and current password.'); return; }
    setBusy(true);
    try { const result = await apiPatch('/customer/profile', customerProfileResponseSchema, input.data);
      await onSaved(); setMessage(result.data.pendingEmail ? 'Contact details saved. Verify your new email before using it to sign in.' : 'Profile saved.');
      form.reset();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save profile.'); }
    finally { setBusy(false); }
  }
  return <><h1>My profile</h1><p>Your customer record. Changing your email sends a verification link to the new address.</p>
    <div className="customer-list"><article><h2>{profile.name}</h2><p>Customer ID: {profile.id}</p>{profile.pendingEmail && <p role="status">Pending email verification: {profile.pendingEmail}</p>}</article></div>
    <form className="customer-profile-form" onSubmit={event => void submit(event)} key={`${profile.phone}-${profile.email}-${profile.addressLine}-${profile.city}-${profile.pincode}`}>
      <label>Mobile number<input name="phone" type="tel" defaultValue={profile.phone} required /></label>
      <label>Email<input name="email" type="email" defaultValue={profile.email} required /></label>
      <label>Address<input name="addressLine" defaultValue={profile.addressLine} required /></label>
      <label>City<input name="city" defaultValue={profile.city} required /></label>
      <label>Pincode<input name="pincode" inputMode="numeric" defaultValue={profile.pincode} required /></label>
      <label>Current password to save changes<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>{message && <p role="status">{message}</p>}{error && <p role="alert" className="customer-error">{error}</p>}
  </>;
}
