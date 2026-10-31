import { createHash } from 'node:crypto';
import { z } from 'zod';
import { moneySchema, positiveQuantitySchema } from '@sunshine/contracts';
import { ApiError, refusal } from '../platform/api-error';

const inputSchema = z.strictObject({
  uniqueSourceId: z.string(), ticketId: z.uuid(), jobId: z.uuid(), customerId: z.uuid(),
  subtotal: moneySchema,
  lines: z.array(z.strictObject({
    sourceId: z.uuid(), type: z.enum(['PART', 'LABOUR']), description: z.string().trim().min(1).max(4000),
    quantity: positiveQuantitySchema, unitPrice: moneySchema, totalPrice: moneySchema,
  })).min(1).max(200),
});
const canonicalDecimal = (value: string, digits: number) => {
  const [whole, fraction = ''] = value.split('.');
  return whole + '.' + fraction.padEnd(digits, '0');
};
const scaled = (value: string) => BigInt(value.replace('.', ''));
const invalid = () => new ApiError(503, 'REPAIR_INVOICE_INPUT_INVALID', 'Repair invoice source facts need review');
const inconsistent = () => refusal({
  code: 'REPAIR_INVOICE_AMOUNT_INVALID', reason: 'The repair charges do not reconcile.', source: 'FINANCE',
  nextAction: 'Review the saved repair sources and their rounded prices before posting.',
});

/** Canonical trusted domain facts; never accept this payload directly from HTTP. */
export function repairInvoiceSource(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw invalid();
  const data = parsed.data, ticketId = data.ticketId.toLowerCase();
  const uniqueSourceId = 'TICKET:' + ticketId + ':REPAIR';
  if (data.uniqueSourceId.toLowerCase() !== uniqueSourceId.toLowerCase()) throw invalid();
  const lines = data.lines.map(line => ({
    sourceId: line.sourceId.toLowerCase(), type: line.type, description: line.description,
    quantity: canonicalDecimal(line.quantity, 3), unitPrice: canonicalDecimal(line.unitPrice, 2),
    totalPrice: canonicalDecimal(line.totalPrice, 2),
  })).sort((a, b) => {
    const left = a.type + ':' + a.sourceId, right = b.type + ':' + b.sourceId;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (new Set(lines.map(line => line.type + ':' + line.sourceId)).size !== lines.length) throw invalid();
  let cents = 0n;
  for (const line of lines) {
    // Exact half-up rounding of quantity millis * price cents, then sum the rounded lines.
    const expected = (scaled(line.quantity) * scaled(line.unitPrice) + 500n) / 1000n;
    if (expected !== scaled(line.totalPrice)) throw inconsistent();
    cents += expected;
  }
  const subtotal = canonicalDecimal(data.subtotal, 2);
  if (cents !== scaled(subtotal)) throw inconsistent();
  const source = {
    uniqueSourceId, ticketId, jobId: data.jobId.toLowerCase(), customerId: data.customerId.toLowerCase(),
    lines, subtotal,
  };
  return { revision: 1, hash: createHash('sha256').update(JSON.stringify(source)).digest('hex'), source };
}

/** Invoice's compact display text; the private source snapshot retains the complete original. */
export function repairChargeDescription(description: string) {
  const characters = Array.from(description);
  return characters.length > 200 ? characters.slice(0, 197).join('') + '...' : description;
}
