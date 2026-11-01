import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  acceptQuoteSchema, createQuoteSchema, enquiryDetailResponseSchema, orderResponseSchema, packageListResponseSchema,
  quoteDecisionChannelSchema, quoteListResponseSchema, quoteResponseSchema, quoteSentChannelSchema,
  rejectQuoteSchema, reviseQuoteSchema, sendQuoteSchema, surveyListResponseSchema,
  type Order, type Quote, type StaffIdentity,
} from '@sunshine/contracts';
import { DetailPattern, ListPattern, MoneyStrip } from '../../components/shared/patterns';
import { formatInr } from '../dashboard/dashboard-model';
import { Field } from '../../components/ui/Field';
import { apiGet, apiPost, ApiRequestError, newIdempotencyKey } from '../../lib/api';
import { useStaffSession } from '../auth/session';
import { CommandDrawer } from '../sales/CommandDrawer';
import { describeProblem, formatWhen, humanize } from '../sales/queries';

export function QuotePanel({ enquiryId }: { enquiryId: string }) {
  const session = useStaffSession();
  if (session.isPending) return <p role="status">Checking quote access…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  if (!session.data || !['SALES', 'ADMIN'].includes(session.data.role)) return null;
  return <SalesQuotes enquiryId={enquiryId} actor={session.data} />;
}

function SalesQuotes({ enquiryId, actor }: { enquiryId: string; actor: StaffIdentity }) {
  const client = useQueryClient();
  const prefix = ['enquiry', enquiryId] as const;
  const enquiry = useQuery({ queryKey: prefix, queryFn: ({ signal }) => apiGet(`/enquiries/${enquiryId}`, enquiryDetailResponseSchema, signal) });
  const quotes = useQuery({ queryKey: [...prefix, 'quotes', actor.id, actor.role], queryFn: ({ signal }) => apiGet(`/enquiries/${enquiryId}/quotes`, quoteListResponseSchema, signal) });
  const surveys = useQuery({ queryKey: [...prefix, 'surveys'], queryFn: ({ signal }) => apiGet(`/enquiries/${enquiryId}/surveys`, surveyListResponseSchema, signal) });
  const packages = useQuery({ queryKey: ['quote-packages', actor.id, actor.role], queryFn: ({ signal }) => apiGet('/packages?pageSize=100', packageListResponseSchema, signal) });
  const existingOrder = useQuery({
    queryKey: [...prefix, 'order', actor.id, actor.role],
    queryFn: async ({ signal }) => {
      try { return (await apiGet(`/enquiries/${enquiryId}/order`, orderResponseSchema, signal)).data; }
      catch (error) { if (error instanceof ApiRequestError && error.status === 404) return null; throw error; }
    },
  });

  if (enquiry.isPending || quotes.isPending || surveys.isPending || existingOrder.isPending) return <p role="status">Loading quotes and order…</p>;
  const failure = enquiry.error ?? quotes.error ?? surveys.error ?? existingOrder.error;
  if (failure) return <section className="pattern-card" role="alert"><h2>Quotes unavailable</h2><p>{describeProblem(failure).message}</p><button onClick={() => void client.invalidateQueries({ queryKey: prefix })}>Retry</button></section>;
  const item = enquiry.data!.data;
  const history = [...quotes.data!.data.items].sort((a, b) => b.revision - a.revision);
  const latest = history[0];
  const survey = [...surveys.data!.data.items].sort((a, b) => b.revision - a.revision)[0];
  const approved = survey?.status === 'APPROVED' ? survey : undefined;
  const order = existingOrder.data;
  const mutable = item.status === 'QUALIFIED' && !order;
  const kits = packages.data?.data.items.filter(kit => kit.active) ?? [];
  const packagePicker = (fields: Record<string, string[]>, selected?: string) => <Field label="Package" error={fields.packageId?.[0]}>
    {control => <select {...control} name="packageId" defaultValue={kits.some(kit => kit.id === selected) ? selected : ''} required>
      <option value="">Choose the current package</option>
      {kits.map(kit => <option key={kit.id} value={kit.id}>{kit.name} · ₹{kit.totalPrice}</option>)}
    </select>}
  </Field>;

  return <section className="pattern-card">
    <h2>Quotes and order</h2>
    {order && <p>Confirmed as <Link to={`/workspace/orders/${order.id}`}>{order.displayNumber}</Link>. The sold quote remains frozen.</p>}
    {!mutable && !order && <p>Quotes remain readable. New commercial actions need an open qualified enquiry.</p>}
    {mutable && !approved && <p>Approve the latest site survey before creating new quote terms.</p>}
    {packages.error && <p role="alert">{describeProblem(packages.error).message} <button onClick={() => void packages.refetch()}>Retry packages</button></p>}
    {mutable && approved && !latest && packages.isSuccess && <CommandDrawer
      primary label="Create quote" title="Create quote" submitLabel="Save quote" enquiryId={enquiryId}
      path={`/enquiries/${enquiryId}/quotes`} schema={createQuoteSchema} responseSchema={quoteResponseSchema}
      build={form => ({ surveyId: approved.id, packageId: form.get('packageId') })}>
      {fields => <><p>Use approved survey revision {approved.revision}. Prices and components are copied from the selected package.</p>{packagePicker(fields)}</>}
    </CommandDrawer>}
    {mutable && approved && latest && packages.isSuccess && <CommandDrawer
      label="Revise quote" title="New quote revision" submitLabel="Create revision" enquiryId={enquiryId}
      path={`/quotes/${latest.id}/revise`} schema={reviseQuoteSchema} responseSchema={quoteResponseSchema}
      build={form => ({ version: latest.version, surveyId: approved.id, packageId: form.get('packageId'), reason: form.get('reason') })}>
      {fields => <>{packagePicker(fields, latest.packageId)}<Field label="Reason for changed terms" error={fields.reason?.[0]}>
        {control => <textarea {...control} name="reason" required maxLength={500} />}
      </Field></>}
    </CommandDrawer>}
    {latest ? <>
      <QuoteFacts quote={latest} />
      {mutable && latest.status === 'DRAFT' && <CommandDrawer
        primary label="Record quote sent" title="Record manual sending" submitLabel="Record sent" enquiryId={enquiryId}
        path={`/quotes/${latest.id}/send`} schema={sendQuoteSchema} responseSchema={quoteResponseSchema}
        build={form => ({ version: latest.version, channel: form.get('channel') })}>
        {fields => <><p>Send the quote outside Solar OS, then record the channel used. This does not send a message.</p>
          <Field label="Sent by" error={fields.channel?.[0]}>{control => <select {...control} name="channel" defaultValue="" required><option value="">Choose channel</option>{quoteSentChannelSchema.options.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select>}</Field>
        </>}
      </CommandDrawer>}
      {mutable && latest.status === 'SENT' && <div className="action-row">
        <CommandDrawer primary label="Record acceptance" title="Customer acceptance" submitLabel="Record acceptance" enquiryId={enquiryId}
          path={`/quotes/${latest.id}/accept`} schema={acceptQuoteSchema} responseSchema={quoteResponseSchema}
          build={form => ({ version: latest.version, acceptedByName: form.get('acceptedByName'), channel: form.get('channel'), reference: form.get('reference') || undefined })}>
          {fields => <><p>Staff records the customer's decision; this does not imply a customer account.</p>
            <Field label="Accepted by" error={fields.acceptedByName?.[0]}>{control => <input {...control} name="acceptedByName" maxLength={120} required />}</Field>
            <Field label="Acceptance channel" error={fields.channel?.[0]}>{control => <select {...control} name="channel" defaultValue="" required><option value="">Choose channel</option>{quoteDecisionChannelSchema.options.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select>}</Field>
            <Field label="Reference (optional)" error={fields.reference?.[0]}>{control => <input {...control} name="reference" maxLength={500} />}</Field>
          </>}
        </CommandDrawer>
        <CommandDrawer label="Record rejection" title="Customer rejected quote" submitLabel="Record rejection" enquiryId={enquiryId}
          path={`/quotes/${latest.id}/reject`} schema={rejectQuoteSchema} responseSchema={quoteResponseSchema}
          build={form => ({ version: latest.version, reason: form.get('reason') })}>
          {fields => <Field label="Reason" error={fields.reason?.[0]}>{control => <textarea {...control} name="reason" required maxLength={500} />}</Field>}
        </CommandDrawer>
      </div>}
      {mutable && latest.status === 'ACCEPTED' && <ConfirmOrder key={latest.id} quote={latest} actor={actor} />}
    </> : <p>No quote has been saved.</p>}
    {history.length > 1 && <details><summary>Earlier quote revisions</summary>{history.slice(1).map(quote => <QuoteFacts key={quote.id} quote={quote} />)}</details>}
  </section>;
}

const months = (count: number) => count % 12 === 0 ? `${count / 12} ${count === 12 ? 'year' : 'years'}` : `${count} months`;

function QuoteFacts({ quote }: { quote: Quote }) {
  const parts = useRef<HTMLDetailsElement>(null);
  const components = quote.lines.filter(line => line.kind === 'COMPONENT');
  // A quote still being decided shows its parts. Once decided, they stay out of the way until someone asks.
  const decided = !['DRAFT', 'SENT'].includes(quote.status);
  return <DetailPattern title={`Quote revision ${quote.revision}: ${humanize(quote.status)}`} entries={[
    { id: 'package', label: 'Package', value: quote.packageSnapshot.name },
    { id: 'package-revision', label: 'Package revision', value: String(quote.packageSnapshot.revision) },
    { id: 'sent', label: 'Sent', value: quote.sentAt ? `${formatWhen(quote.sentAt)} via ${humanize(quote.sentChannel!)}` : 'Not recorded' },
    { id: 'decision', label: 'Decision', value: quote.acceptedByName ? `${quote.acceptedByName} via ${humanize(quote.decisionChannel!)}` : quote.decisionReason ?? 'Not recorded' },
  ]}>
    <MoneyStrip items={[
      { id: 'hardware', label: 'Package hardware', value: formatInr(quote.hardwarePrice) },
      { id: 'installation', label: 'Installation', value: formatInr(quote.installationPrice) },
      { id: 'total', label: 'Quote total', value: formatInr(quote.totalPrice), strong: true },
    ]} />
    <details ref={parts} className="fold" open={!decided}>
      <summary>What's included ({components.length} components)</summary>
      <p>Frozen for {quote.customerSnapshot.contactName}, {quote.customerSnapshot.addressLine}, {quote.customerSnapshot.city} {quote.customerSnapshot.pincode}. Components are charged once in the package amount.</p>
      <ListPattern title="Frozen component requirements" columns={[{ id: 'part', label: 'Component' }, { id: 'qty', label: 'Quantity' }, { id: 'policy', label: 'Saved warranty terms' }]}
        rows={components.map(line => ({ id: line.id, cells: {
          part: <span>{line.description}{line.productSnapshot?.manufacturer && <small>{line.productSnapshot.manufacturer.name}</small>}</span>,
          qty: String(Number(line.quantity)),
          policy: line.warrantyPolicySnapshot ? <span title={`${line.warrantyPolicySnapshot.policyName}, ${line.warrantyPolicySnapshot.revision}`}>{months(line.warrantyPolicySnapshot.durationMonths)}<small>{line.warrantyPolicySnapshot.scope}</small></span> : 'Not configured',
        } }))} />
    </details>
    <button type="button" onClick={() => { if (parts.current) parts.current.open = true; window.print(); }}>Print quote</button>
  </DetailPattern>;
}

function ConfirmOrder({ quote, actor }: { quote: Quote; actor: StaffIdentity }) {
  const client = useQueryClient(), saved = useRef<{ key: string; body: { quoteId: string } } | null>(null), inFlight = useRef(false);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [result, setResult] = useState<Order | null>(null);
  async function confirm() {
    if (inFlight.current) return;
    const intent = saved.current ?? { key: newIdempotencyKey(), body: { quoteId: quote.id } };
    saved.current = intent; inFlight.current = true; setBusy(true); setFailure('');
    let order: Order;
    try { order = (await apiPost('/orders', orderResponseSchema, intent.body, { idempotencyKey: intent.key })).data; }
    catch (error) { setFailure(describeProblem(error).message); inFlight.current = false; setBusy(false); return; }
    setResult(order); saved.current = null;
    client.setQueryData(['enquiry', quote.enquiryId, 'order', actor.id, actor.role], order);
    try { await Promise.all([client.invalidateQueries({ queryKey: ['enquiry', quote.enquiryId] }), client.invalidateQueries({ queryKey: ['enquiries'] })]); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div>
    <p>Confirming creates the order, its job, packing requirements and invoice from these accepted terms.</p>
    {result ? <p role="status">Confirmed: <Link to={`/workspace/orders/${result.id}`}>{result.displayNumber}</Link></p> :
      <button className="button-primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : saved.current ? 'Retry confirmation' : 'Confirm order'}</button>}
    {failure && <p role="alert" className="form-error">{failure} Retry preserves the same confirmation request.</p>}
  </div>;
}
