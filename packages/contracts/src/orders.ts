import { z } from 'zod';
import { decimalString } from './commands';
import { moneySchema, positiveQuantitySchema } from './shared';

// Orders, invoices and receipts (D2, C5: R7, R8, R21). Confirmation and receipts are idempotent commands
// (send an Idempotency-Key); every amount is computed by the server, never taken from the client.

export const invoiceStatusSchema = z.enum(['POSTED', 'PART_PAID', 'PAID']);
export const invoiceSourceTypeSchema = z.enum(['ORDER', 'TICKET']);
export const invoiceKindSchema = z.enum(['SALE', 'REPAIR']);
export const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'], { error: 'Choose how the money was received' });
export const paymentKindSchema = z.enum(['ADVANCE', 'PARTIAL', 'FINAL']);

/** Confirm the customer's accepted quote as an order. Only the quote is chosen; everything else comes from it. */
export const confirmOrderSchema = z.object({ quoteId: z.uuid({ error: 'Choose the accepted quote' }) }).strict();
export type ConfirmOrder = z.output<typeof confirmOrderSchema>;

/** A receipt for money already received outside the app (no payment gateway). */
export const recordPaymentSchema = z.object({
  amountInr: decimalString('the amount', 999_999_999_999.99)
    .refine((value) => Number(value) > 0, 'The amount must be more than zero'),
  method: paymentMethodSchema,
  reference: z.string({ error: 'Enter the payment reference' }).trim()
    .min(1, 'Enter the payment reference').max(120, 'The reference must be at most 120 characters'),
  receivedAt: z.iso.datetime({ offset: true, error: 'Enter when the money was received' }),
}).strict();
export type RecordPayment = z.output<typeof recordPaymentSchema>;
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const paymentSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  amount: moneySchema,
  method: paymentMethodSchema,
  reference: z.string(),
  kind: paymentKindSchema,
  receivedAt: z.iso.datetime(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const invoiceLineSchema = z.object({
  id: z.uuid(),
  position: z.number().int().positive(),
  description: z.string(),
  quantity: positiveQuantitySchema,
  unitPrice: moneySchema,
  lineTotal: moneySchema,
  quoteLineId: z.uuid().nullable(),
});

export const invoiceSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  displayNumber: z.string().regex(/^INV-\d{6,}$/),
  sourceType: invoiceSourceTypeSchema,
  sourceId: z.uuid(),
  kind: invoiceKindSchema,
  orderId: z.uuid().nullable(),
  customerId: z.uuid(),
  status: invoiceStatusSchema,
  subtotal: moneySchema,
  taxAmount: moneySchema,
  taxNote: z.string().min(1),
  total: moneySchema,
  paidAmount: moneySchema,
  balance: moneySchema,
  version: z.number().int().positive(),
  postedAt: z.iso.datetime(),
  lines: z.array(invoiceLineSchema).min(1),
  payments: z.array(paymentSchema),
});
export type Invoice = z.infer<typeof invoiceSchema>;
export const invoiceResponseSchema = z.object({ data: invoiceSchema });

export const packingRequirementSchema = z.object({
  id: z.uuid(),
  quoteLineId: z.uuid(),
  productId: z.uuid(),
  description: z.string(),
  quantity: positiveQuantitySchema,
});
export type PackingRequirement = z.infer<typeof packingRequirementSchema>;

export const orderSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  displayNumber: z.string().regex(/^ORD-\d{6,}$/),
  quoteId: z.uuid(),
  enquiryId: z.uuid(),
  customerId: z.uuid(),
<<<<<<< HEAD
  /** Set by D3's job helper in the confirming transaction. */
=======
  /** Null until D3's job helper is wired; then set in the confirming transaction. */
>>>>>>> origin/main
  jobId: z.uuid().nullable(),
  confirmedById: z.uuid(),
  confirmedAt: z.iso.datetime(),
  packing: z.array(packingRequirementSchema).min(1),
  invoice: invoiceSchema,
  /** Fulfilment is released once any payment is recorded (the advance); D3's readiness checks read this. */
  released: z.boolean(),
});
export type Order = z.infer<typeof orderSchema>;
export const orderResponseSchema = z.object({ data: orderSchema });

/** What the warehouse needs to pack an order: no invoice, amounts or payment references (D3 review on #29). */
export const orderFulfilmentSchema = orderSchema.pick({
  id: true, number: true, displayNumber: true, enquiryId: true, jobId: true, confirmedAt: true, packing: true, released: true,
});
export type OrderFulfilment = z.infer<typeof orderFulfilmentSchema>;
export const orderFulfilmentResponseSchema = z.object({ data: orderFulfilmentSchema });

/** What D3 and D4 read about an order's money, inside their own transaction. */
export const orderPaymentFactsSchema = z.object({
  orderId: z.uuid(),
  invoiceId: z.uuid(),
  status: invoiceStatusSchema,
  total: moneySchema,
  paidAmount: moneySchema,
  balance: moneySchema,
  released: z.boolean(),
});
export type OrderPaymentFacts = z.infer<typeof orderPaymentFactsSchema>;
