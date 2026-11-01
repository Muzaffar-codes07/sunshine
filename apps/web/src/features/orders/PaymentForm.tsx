import { useRef, useState, type FormEvent } from 'react';
import { invoiceResponseSchema, paymentMethodSchema, recordPaymentSchema, type Invoice, type RecordPayment } from '@sunshine/contracts';
import { Field } from '../../components/ui/Field';
import { apiPost, ApiRequestError, newIdempotencyKey } from '../../lib/api';
import { describeProblem, humanize, isoToLocal, localToIso, validate, type Problem } from '../sales/queries';

type Intent = { key: string; body: RecordPayment };
const cents = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
};

/** Records money received outside the app. An uncertain response keeps the same body and retry key. */
export function PaymentForm({ invoice, onRecorded }: { invoice: Invoice; onRecorded: (invoice: Invoice) => void | Promise<void> }) {
  const intent = useRef<Intent | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [problem, setProblem] = useState<Problem>({ message: '', fields: {} });
  const [success, setSuccess] = useState('');
  const [sequence, setSequence] = useState(0);

  async function record(saved: Intent) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setProblem({ message: '', fields: {} }); setSuccess('');
    let posted: Invoice;
    try {
      posted = (await apiPost(`/invoices/${invoice.id}/payments`, invoiceResponseSchema, saved.body, { idempotencyKey: saved.key })).data;
    } catch (error) {
      const definitive = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
      if (definitive) intent.current = null;
      setUncertain(!definitive); setProblem(describeProblem(error));
      inFlight.current = false; setBusy(false); return;
    }
    intent.current = null; setUncertain(false); setSequence(value => value + 1);
    setSuccess(`Receipt recorded. Outstanding balance: ₹${posted.balance}.`);
    // A refresh failure must never be reported as a failed money command.
    try { await onRecorded(posted); }
    catch { setSuccess(`Receipt recorded. Refresh the order to see balance ₹${posted.balance}.`); }
    finally { inFlight.current = false; setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    const form = new FormData(event.currentTarget);
    let receivedAt: string;
    try { receivedAt = localToIso(form.get('receivedAt')); }
    catch { setProblem({ message: 'Check the received date and time.', fields: { receivedAt: ['Enter a valid date and time'] } }); return; }
    const checked = validate(recordPaymentSchema, {
      amountInr: form.get('amountInr'), method: form.get('method'), reference: form.get('reference'), receivedAt,
    });
    if ('problem' in checked) { setProblem(checked.problem); return; }
    if (cents(checked.data.amountInr) > cents(invoice.balance)) {
      setProblem({ message: 'The receipt exceeds the outstanding balance.', fields: { amountInr: [`Enter at most ₹${invoice.balance}`] } }); return;
    }
    if (invoice.payments.some(payment => payment.method === checked.data.method && payment.reference === checked.data.reference)) {
      setProblem({ message: 'This reference is already recorded on the invoice.', fields: { reference: ['Check the existing receipts before recording another'] } }); return;
    }
    const saved = { key: newIdempotencyKey(), body: checked.data };
    intent.current = saved; void record(saved);
  }

  if (invoice.status === 'PAID' && !uncertain) return <p>This invoice is fully paid.</p>;
  return <section className="pattern-card">
    <h2>Record payment received</h2>
    <p>Record money already received outside Solar OS. This form does not collect or transfer money.</p>
    <p>Outstanding balance: <strong>₹{invoice.balance}</strong></p>
    <form key={sequence} onSubmit={submit} noValidate aria-busy={busy}>
      <fieldset disabled={busy || uncertain}>
        <legend>Receipt details</legend>
        <Field label="Amount received (₹)" error={problem.fields.amountInr?.[0]}>
          {control => <input {...control} name="amountInr" inputMode="decimal" required />}
        </Field>
        <Field label="Method" error={problem.fields.method?.[0]}>
          {control => <select {...control} name="method" defaultValue="" required><option value="">Choose method</option>{paymentMethodSchema.options.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select>}
        </Field>
        <Field label="Receipt or bank reference" error={problem.fields.reference?.[0]}>
          {control => <input {...control} name="reference" maxLength={120} required />}
        </Field>
        <Field label="Received at (local time)" error={problem.fields.receivedAt?.[0]}>
          {control => <input {...control} name="receivedAt" type="datetime-local" defaultValue={isoToLocal(new Date().toISOString())} required />}
        </Field>
        <button type="submit">{busy ? 'Recording…' : 'Record receipt'}</button>
      </fieldset>
    </form>
    {problem.message && <p role="alert" className="form-error">{problem.message}</p>}
    {uncertain && <div role="alert">
      <p>The result has not been confirmed. Retry this same receipt; its details are preserved so it can be recorded only once. Check the invoice before entering another receipt.</p>
      <button disabled={busy} onClick={() => { if (intent.current) void record(intent.current); }}>{busy ? 'Checking receipt…' : 'Retry this receipt'}</button>
    </div>}
    {success && <p role="status">{success}</p>}
  </section>;
}
