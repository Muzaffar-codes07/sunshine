import { useState, type FormEvent } from 'react';
import { ActionDrawer } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { describeProblem, useCatalogueProducts, useReceiveStock, useStockLocations } from './queries';

interface StockReceiptDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function StockReceiptDrawer({ open, onClose }: StockReceiptDrawerProps) {
  const locations = useStockLocations();
  const products = useCatalogueProducts();
  const receiveMutation = useReceiveStock();

  const [reference, setReference] = useState('');
  const [locationId, setLocationId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0.00');
  const [zeroCostReason, setZeroCostReason] = useState('');
  const [serialsText, setSerialsText] = useState('');
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isZeroCost = /^0(?:\.0{1,2})?$/.test(unitCost.trim());

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    if (!reference.trim()) {
      setFormError('Please enter a delivery reference or PO number.');
      return;
    }
    if (!locationId) {
      setFormError('Please select a destination warehouse location.');
      return;
    }
    if (!productId) {
      setFormError('Please select a product.');
      return;
    }

    const serials = serialsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (isZeroCost && (!zeroCostReason.trim() || zeroCostReason.trim().length < 5)) {
      setFormError('When unit cost is 0.00, document the zero acquisition cost reason (minimum 5 characters).');
      return;
    }

    try {
      const result = await receiveMutation.mutateAsync({
        reference: reference.trim(),
        locationId,
        receivedAt: new Date().toISOString(),
        lines: [
          {
            productId,
            quantity: quantity.trim(),
            unitCost: unitCost.trim(),
            zeroCostReason: isZeroCost ? zeroCostReason.trim() : undefined,
            serials,
          },
        ],
      });

      setSuccessMessage(`Stock receipt recorded successfully (Reference: ${result.data.reference})`);
      setReference('');
      setQuantity('1');
      setUnitCost('0.00');
      setZeroCostReason('');
      setSerialsText('');
    } catch (err) {
      setFormError(describeProblem(err).message);
    }
  };

  const handleClose = () => {
    setFormError('');
    setSuccessMessage('');
    onClose();
  };

  return (
    <ActionDrawer open={open} title="Receive Goods / Inward Stock" onClose={handleClose}>
      <form onSubmit={handleSubmit} noValidate className="receipt-form">
        <Field label="Receipt reference / PO number" hint="E.g. PO-2026-0042 or Delivery Challan">
          {(c) => (
            <input
              {...c}
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="PO-2026-XXXX"
              required
            />
          )}
        </Field>

        <Field label="Destination location">
          {(c) => (
            <select
              {...c}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              <option value="">Select location…</option>
              {(locations.data?.data ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} - {loc.name} ({loc.kind})
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Product to receive">
          {(c) => (
            <select
              {...c}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">Select product from catalogue…</option>
              {(products.data?.data.items ?? []).map((prod) => (
                <option key={prod.id} value={prod.id}>
                  [{prod.sku}] {prod.name} ({prod.trackingMode})
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="receipt-row">
          <Field label="Quantity">
            {(c) => (
              <input
                {...c}
                type="text"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1.000"
                required
              />
            )}
          </Field>

          <Field label="Unit cost (INR)">
            {(c) => (
              <input
                {...c}
                type="text"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                required
              />
            )}
          </Field>
        </div>

        {isZeroCost && (
          <Field
            label="Zero-cost explanation"
            hint="Required when unit cost is zero (e.g. warranty replacement, sample, internal transfer)"
          >
            {(c) => (
              <input
                {...c}
                type="text"
                value={zeroCostReason}
                onChange={(e) => setZeroCostReason(e.target.value)}
                placeholder="Reason for zero cost…"
                required
              />
            )}
          </Field>
        )}

        <Field
          label="Equipment serial numbers (if serialized)"
          hint="One per line or comma-separated. For serialized goods, count must match whole quantity."
        >
          {(c) => (
            <textarea
              {...c}
              rows={3}
              value={serialsText}
              onChange={(e) => setSerialsText(e.target.value)}
              placeholder="SERIAL-001&#10;SERIAL-002"
            />
          )}
        </Field>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        {successMessage && (
          <p className="field-hint" role="status" style={{ color: '#53d6a1', fontWeight: 600 }}>
            {successMessage}
          </p>
        )}

        <div className="receipt-actions">
          <button type="submit" disabled={receiveMutation.isPending}>
            {receiveMutation.isPending ? 'Recording receipt…' : 'Post Stock Receipt'}
          </button>
        </div>
      </form>
    </ActionDrawer>
  );
}
