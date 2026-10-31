import { useState, type FormEvent } from 'react';
import { receiveStockRequestSchema, stockReceiptResponseSchema } from '@sunshine/contracts';
import { ActionDrawer } from '../../components/shared/patterns';
import { CommandFeedback } from '../../components/shared/CommandFeedback';
import { Field } from '../../components/ui/Field';
import { isoToLocal, localToIso } from '../sales/queries';
import { checkInput, noProblem, useHardware, useLocations, useStockCommand } from './queries';

/** One product per receipt. A serialized product's quantity is the number of serials entered. */
export function ReceiveStock() {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [notice, setNotice] = useState('');
  const products = useHardware();
  const locations = useLocations();
  const command = useStockCommand(stockReceiptResponseSchema, (result) => {
    setOpen(false); setProductId('');
    setNotice(`Receipt ${result.data.reference} recorded.`);
  });
  const usable = locations.data?.data.filter((location) => location.kind === 'USABLE') ?? [];
  const items = products.data?.data.items.filter((item) => item.active && item.trackingMode !== 'NONE') ?? [];
  const serialized = items.find((item) => item.id === productId)?.trackingMode === 'SERIALIZED';
  const { fields } = command.problem;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const serials = String(form.get('serials') ?? '').split('\n').map((value) => value.trim()).filter(Boolean);
    let receivedAt = '';
    try { receivedAt = localToIso(form.get('receivedAt')) ?? ''; } catch { /* The contract reports it below. */ }
    const reason = String(form.get('zeroCostReason') ?? '').trim();
    const checked = checkInput(receiveStockRequestSchema, {
      reference: form.get('reference'), locationId: form.get('locationId'), receivedAt,
      lines: [{
        productId, quantity: serialized ? String(serials.length) : form.get('quantity'), unitCost: form.get('unitCost'),
        ...(reason && { zeroCostReason: reason }), ...(serialized && { serials }),
      }],
    }, {
      reference: 'Enter the delivery reference.', locationId: 'Choose a location.', receivedAt: 'Enter a valid date and time.', productId: 'Choose a product.',
      quantity: serialized ? 'Enter at least one serial number.' : 'Enter a quantity above zero, with up to 3 decimal places.',
      unitCost: 'Enter the cost in rupees, with up to 2 decimal places.',
    });
    if ('problem' in checked) { command.setProblem(checked.problem); return; }
    command.run('/stock/receipts', checked.data);
  }

  return <>
    <button type="button" onClick={() => { setOpen(true); setNotice(''); command.setProblem(noProblem); }}>Receive stock</button>
    {notice && <p role="status">{notice}</p>}
    <ActionDrawer open={open} title="Receive stock" onClose={() => { if (!command.uncertain) setOpen(false); }}>
      {open && <form onSubmit={submit} noValidate aria-busy={command.busy}>
        <fieldset disabled={command.busy || command.uncertain}>
          <legend>Goods received</legend>
          <Field label="Delivery reference" error={fields.reference}>{(control) => <input {...control} name="reference" maxLength={128} required />}</Field>
          <Field label="Received at (local time)" error={fields.receivedAt}>{(control) => <input {...control} name="receivedAt" type="datetime-local" defaultValue={isoToLocal(new Date().toISOString())} required />}</Field>
          <Field label="Location" error={fields.locationId}>{(control) => <select {...control} name="locationId" required>{usable.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>}</Field>
          <Field label="Product" error={fields.productId}>{(control) => <select {...control} name="productId" required value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Choose product</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
          </select>}</Field>
          {serialized
            ? <Field label="Serial numbers" hint="One per line, or scan each one. The quantity is the number of serials." error={fields.serials ?? fields.quantity}>{(control) => <textarea {...control} name="serials" rows={5} required />}</Field>
            : <Field label="Quantity" error={fields.quantity}>{(control) => <input {...control} name="quantity" inputMode="decimal" required />}</Field>}
          <Field label="Actual cost per unit (₹)" error={fields.unitCost}>{(control) => <input {...control} name="unitCost" inputMode="decimal" required />}</Field>
          <Field label="Reason for zero cost" hint="Only needed when the cost is zero." error={fields.zeroCostReason}>{(control) => <input {...control} name="zeroCostReason" maxLength={500} />}</Field>
          <button type="submit">{command.busy ? 'Recording…' : 'Record receipt'}</button>
        </fieldset>
        <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry} />
      </form>}
    </ActionDrawer>
  </>;
}
