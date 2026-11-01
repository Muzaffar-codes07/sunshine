import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { publicEnquiryRequestSchema, publicEnquiryResponseSchema } from '@sunshine/contracts';
import { CheckCircle2 } from 'lucide-react';
import { BrandMark } from '../../components/shared/Brand';
import { SolarArt } from '../../components/shared/SolarArt';
import { Field } from '../../components/ui/Field';
import { apiPost, ApiRequestError } from '../../lib/api';

const textFields = [
  ['name', 'Name', 'text'], ['phone', 'Mobile number', 'tel'],
  ['email', 'Email (optional)', 'email'], ['addressLine', 'Address', 'text'],
  ['city', 'City', 'text'], ['pincode', 'Pincode', 'text'],
] as const;

const AUTOCOMPLETE: Record<typeof textFields[number][0], string> = { name: 'name', phone: 'tel', email: 'email', addressLine: 'street-address', city: 'address-level2', pincode: 'postal-code' };

export function PublicEnquiryPage() {
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    const parsed = publicEnquiryRequestSchema.safeParse({
      ...Object.fromEntries(textFields.map(([key]) => [key, values.get(key)])),
      requestedCapacityKw: values.get('requestedCapacityKw'),
      systemType: values.get('systemType') || undefined,
      subsidyInterest: values.get('subsidyInterest') === 'on',
      message: values.get('message'),
    });
    setMessage('');
    setErrors({});
    if (!parsed.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (fields[String(issue.path[0])] ??= []).push(issue.message);
      setErrors(fields);
      setMessage('Check the highlighted fields and submit again.');
      return;
    }
    setPending(true);
    try {
      await apiPost('/enquiries', publicEnquiryResponseSchema, parsed.data);
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiRequestError) setErrors(error.fieldErrors);
      setMessage(error instanceof Error ? error.message : 'Could not submit your enquiry. Try again.');
    } finally { setPending(false); }
  }

  const textField = ([key, label, type]: typeof textFields[number]) => <Field key={key} label={label} error={errors[key]?.[0]}>
    {(control) => <input {...control} name={key} type={type} required={key !== 'email'} autoComplete={AUTOCOMPLETE[key]} />}
  </Field>;

  return <div className="enquiry-scene"><div className="enquiry-split">
    <aside className="enquiry-side">
      <SolarArt className="login-art" />
      <Link to="/" aria-label="Solar OS home"><BrandMark /> Solar OS</Link>
      <h2>Clean power for <span>your rooftop.</span></h2>
      <ol className="enquiry-steps">
        <li><b>1</b> We contact you about your enquiry.</li>
        <li><b>2</b> A technician surveys your roof.</li>
        <li><b>3</b> You get a clear, itemised quote.</li>
      </ol>
    </aside>
    <main className="enquiry-form">
      <h1>Solar enquiry</h1>
      {submitted
        ? <div className="enquiry-done" role="status"><CheckCircle2 size="2.5rem" aria-hidden="true" /><p>Your enquiry has been received. Thank you.</p></div>
        : <><p>Tell us about you and your site. It takes about two minutes.</p>
          <form onSubmit={(event) => void submit(event)} noValidate aria-busy={pending}>
            <fieldset disabled={pending}><legend>Your details</legend>{textFields.slice(0, 3).map(textField)}</fieldset>
            <fieldset disabled={pending}><legend>Your site</legend>{textFields.slice(3).map(textField)}</fieldset>
            <fieldset disabled={pending}>
              <legend>Your requirements</legend>
              <Field label="Requested capacity (kW)" error={errors.requestedCapacityKw?.[0]}>
                {(control) => <select {...control} name="requestedCapacityKw" defaultValue="" required><option value="">Choose capacity</option>{[1, 2, 3, 4, 5].map((kw) => <option key={kw} value={kw}>{kw} kW</option>)}</select>}
              </Field>
              <Field label="System type (optional)" error={errors.systemType?.[0]}>
                {(control) => <select {...control} name="systemType" defaultValue=""><option value="">Not decided</option><option value="ON_GRID">On-Grid</option><option value="OFF_GRID">Off-Grid</option></select>}
              </Field>
              <Field label="Interested in a subsidy" error={errors.subsidyInterest?.[0]}>
                {(control) => <input {...control} type="checkbox" name="subsidyInterest" />}
              </Field>
              <Field label="Message (optional)" error={errors.message?.[0]}>
                {(control) => <textarea {...control} name="message" maxLength={1000} />}
              </Field>
              <button type="submit">{pending ? 'Submitting…' : 'Submit enquiry'}</button>
            </fieldset>
            {message && <p role="alert" className="form-error">{message}</p>}
          </form></>}
    </main>
  </div></div>;
}
