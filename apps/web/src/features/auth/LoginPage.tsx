import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BrandMark } from '../../components/shared/Brand';
import { SolarArt } from '../../components/shared/SolarArt';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginRequestSchema, staffSessionResponseSchema } from '@sunshine/contracts';
import { Field } from '../../components/ui/Field';
import { FormPattern } from '../../components/shared/patterns';
import { apiPost, ApiRequestError } from '../../lib/api';
import { sessionKey, useStaffSession } from './session';

export function LoginPage() {
  const session = useStaffSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const requested = location.state?.from;
  const destination = typeof requested === 'string' && requested.startsWith('/workspace') && !requested.startsWith('//') ? requested : '/workspace';
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    const input = loginRequestSchema.safeParse({ email: values.get('email'), password: values.get('password') });
    setMessage(''); setErrors({});
    if (!input.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of input.error.issues) (fields[String(issue.path[0])] ??= []).push(issue.message);
      setErrors(fields);
      setMessage('Check your email and password.');
      return;
    }
    setPending(true);
    try {
      const result = await apiPost('/auth/login', staffSessionResponseSchema, input.data);
      await client.cancelQueries();
      client.clear();
      client.setQueryData(sessionKey, result.data);
      navigate(destination, { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) setErrors(error.fieldErrors);
      setMessage(error instanceof Error ? error.message : 'Unable to sign in. Try again.');
    } finally { setPending(false); }
  }

  if (session.isPending) return <main className="login-scene"><div className="login-glass" role="status">Checking your session…</div></main>;
  if (session.data && !session.isError) return <Navigate to={destination} replace />;
  return <main className="login-scene">
        <div className="login-frame">
    <div className="login-topbar"><Link to="/" className="login-brand"><BrandMark /> Solar OS</Link><span className="login-badge">Solar installation management</span></div>
    <div className="login-layout">
    <section className="login-intro"><SolarArt className="login-art" /><p className="login-kicker">A BRIGHTER WAY TO WORK</p><h1>Good energy.<br />Connected<br /><span>operations.</span></h1><p>From the first enquiry to lasting service.<br />One place to keep it all moving.</p></section>
    <section className="enquiry-page login-page login-glass" aria-labelledby="login-title">
    <span className="login-card-label">YOUR WORKSPACE</span><h2 id="login-title">Welcome back.</h2>
    <p className="login-description">Sign in with your staff account to continue.</p>
    {session.isError && <p className="login-notice" role="alert">Session check unavailable. You can still try signing in.</p>}
    <FormPattern title="Staff credentials" onSubmit={(event) => void submit(event)} pending={pending} submitLabel="Sign in" error={message}>
        <Field label="Email" error={errors.email?.[0]}>{(control) => <input {...control} name="email" type="email" autoComplete="username" required />}</Field>
        <Field label="Password" error={errors.password?.[0]}>{(control) => <input {...control} name="password" type="password" autoComplete="current-password" required />}</Field>
    </FormPattern>
    <p className="login-footnote">Need staff access? Contact your administrator. <Link to="/customer/login">Customer sign in</Link></p>
    </section>
    </div>
    <div className="login-bottom"><span>From the first enquiry to lasting service</span><Link to="/enquire">Make an enquiry</Link></div>
    </div>
  </main>;
}
