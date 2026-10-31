import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { orderFulfilmentResponseSchema, orderResponseSchema, type Invoice, type Order, type OrderFulfilment, type StaffIdentity } from '@sunshine/contracts';
import { DetailPattern, ListPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { apiGet } from '../../lib/api';
import { useStaffSession } from '../auth/session';
import { describeProblem, formatWhen, humanize } from '../sales/queries';
import { PaymentForm } from './PaymentForm';

export function OrderPage({ orderId }: { orderId?: string }) {
  const params = useParams(); const session = useStaffSession();
  const id = orderId ?? params.id;
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  const actor = session.data;
  if (!actor) return <p><Link to="/login">Sign in to view an order</Link></p>;
  if (!['SALES', 'ADMIN', 'WAREHOUSE'].includes(actor.role)) return <p role="alert">Your role cannot view orders.</p>;
  if (!id) return <OrderLookup />;
  if (!z.uuid().safeParse(id).success) return <p role="alert">Enter a valid order ID. <Link to="/workspace/orders">Open another order</Link></p>;
  return actor.role === 'WAREHOUSE' ? <WarehouseOrder id={id} actor={actor} /> : <FinancialOrder id={id} actor={actor} />;
}

function OrderLookup() {
  const [error, setError] = useState(''); const navigate = useNavigate();
  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const id = String(new FormData(event.currentTarget).get('orderId') ?? '').trim();
    if (!z.uuid().safeParse(id).success) { setError('Enter the order ID from its enquiry or fulfilment handoff.'); return; }
    navigate(`/workspace/orders/${id}`);
  }
  return <><h1>Orders</h1><p>Open an order from its enquiry or enter its ID.</p>
    <p><Link to="/workspace/sales">Go to the enquiry queue</Link></p>
    <form onSubmit={open} noValidate><Field label="Order ID" error={error || undefined}>{control => <input {...control} name="orderId" required />}</Field><button type="submit">Open order</button></form>
  </>;
}

function Packing({ order }: { order: OrderFulfilment }) {
  return <ListPattern title="Packing requirements" columns={[{ id: 'item', label: 'Included component' }, { id: 'qty', label: 'Quantity' }]}
    rows={order.packing.map(item => ({ id: item.id, cells: { item: item.description, qty: item.quantity } }))} />;
}

function OrderFacts({ order }: { order: OrderFulfilment }) {
  return <DetailPattern title={order.displayNumber} entries={[
    { id: 'date', label: 'Confirmed', value: formatWhen(order.confirmedAt) },
    { id: 'release', label: 'Fulfilment', value: order.released ? 'Released after recorded payment' : 'Awaiting advance payment' },
    { id: 'job', label: 'Job ID', value: order.jobId ?? 'Not available' },
  ]}><Packing order={order} /></DetailPattern>;
}

function WarehouseOrder({ id, actor }: { id: string; actor: StaffIdentity }) {
  const order = useQuery({
    queryKey: ['order', id, 'fulfilment', actor.id, actor.role],
    queryFn: ({ signal }) => apiGet(`/orders/${id}/fulfilment`, orderFulfilmentResponseSchema, signal),
  });
  if (order.isPending) return <p role="status">Loading fulfilment…</p>;
  if (order.error) return <div role="alert"><p>{describeProblem(order.error).message}</p><button onClick={() => void order.refetch()}>Retry</button></div>;
  return <><h1>Order fulfilment</h1><OrderFacts order={order.data.data} /><p><Link to="/workspace/orders">Open another order</Link></p></>;
}

function FinancialOrder({ id, actor }: { id: string; actor: StaffIdentity }) {
  const client = useQueryClient();
  const key = ['order', id, 'finance', actor.id, actor.role] as const;
  const order = useQuery({ queryKey: key, queryFn: ({ signal }) => apiGet(`/orders/${id}`, orderResponseSchema, signal) });
  if (order.isPending) return <p role="status">Loading order…</p>;
  if (order.error) return <div role="alert"><p>{describeProblem(order.error).message}</p><button onClick={() => void order.refetch()}>Retry</button></div>;
  const item = order.data.data, invoice = item.invoice;
  async function recorded(updated: Invoice) {
    client.setQueryData<{ data: Order }>(key, current => current && ({ data: { ...current.data, invoice: updated, released: !/^0(?:\.0+)?$/.test(updated.paidAmount) } }));
    await Promise.all([
      client.invalidateQueries({ queryKey: ['order', id] }),
      client.invalidateQueries({ queryKey: ['enquiry', item.enquiryId] }),
      client.invalidateQueries({ queryKey: ['enquiries'] }),
    ]);
  }
  return <>
    <p><Link to={`/workspace/sales/enquiries/${item.enquiryId}`}>Back to enquiry</Link></p>
    <h1>{item.displayNumber}</h1><button onClick={() => window.print()}>Print order and invoice</button>
    <OrderFacts order={item} />
    <DetailPattern title={invoice.displayNumber} entries={[
      { id: 'status', label: 'Status', value: humanize(invoice.status) },
      { id: 'subtotal', label: 'Subtotal', value: `₹${invoice.subtotal}` },
      { id: 'tax', label: 'Tax', value: `₹${invoice.taxAmount} — ${invoice.taxNote}` },
      { id: 'total', label: 'Total', value: `₹${invoice.total}` },
      { id: 'paid', label: 'Paid', value: `₹${invoice.paidAmount}` },
      { id: 'balance', label: 'Outstanding balance', value: `₹${invoice.balance}` },
    ]}>
      <ListPattern title="Invoice charges" columns={[{ id: 'item', label: 'Description' }, { id: 'qty', label: 'Quantity' }, { id: 'total', label: 'Amount' }]}
        rows={invoice.lines.map(line => ({ id: line.id, cells: { item: line.description, qty: line.quantity, total: `₹${line.lineTotal}` } }))} />
    </DetailPattern>
    <ListPattern title="Recorded receipts" empty="No payment has been recorded." columns={[
      { id: 'when', label: 'Received' }, { id: 'method', label: 'Method' }, { id: 'reference', label: 'Reference' }, { id: 'kind', label: 'Kind' }, { id: 'amount', label: 'Amount' },
    ]} rows={invoice.payments.map(payment => ({ id: payment.id, cells: {
      when: formatWhen(payment.receivedAt), method: humanize(payment.method), reference: payment.reference, kind: humanize(payment.kind), amount: `₹${payment.amount}`,
    } }))} />
    {actor.role === 'ADMIN' ? <PaymentForm key={invoice.id} invoice={invoice} onRecorded={recorded} /> : <p>An administrator records payments received.</p>}
  </>;
}
