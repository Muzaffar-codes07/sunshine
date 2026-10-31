import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { publicEnquiryRequestSchema, publicEnquiryResponseSchema } from '@sunshine/contracts';
import { Field } from '../../components/ui/Field';
import { apiPost, ApiRequestError } from '../../lib/api';

const textFields = [
  ['name', 'Name', 'text'], ['phone', 'Mobile number', 'tel'],
  ['email', 'Email (optional)', 'email'], ['addressLine', 'Address', 'text'],
  ['city', 'City', 'text'], ['pincode', 'Pincode', 'text'],
] as const;

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

  return <main className="enquiry-page">
    <Link to="/">Sunshine home</Link>
    <h1>Solar enquiry</h1>
    {submitted ? <p role="status">Your enquiry has been received. Thank you.</p> : <form onSubmit={(event) => void submit(event)} noValidate>
      <fieldset disabled={pending}>
        <legend>Your requirements</legend>
        {textFields.map(([key, label, type]) => <Field key={key} label={label} error={errors[key]?.[0]}>
          {(control) => <input {...control} name={key} type={type} required={key !== 'email'} />}
        </Field>)}
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
    </form>}
  </main>;
}
