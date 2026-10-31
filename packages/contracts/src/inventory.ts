import { z } from 'zod';
import { moneySchema, positiveQuantitySchema, quantitySchema } from './shared';

const version = z.number().int().positive();
const uuidList = z.array(z.uuid()).max(200).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs are not allowed');
const reference = z.string().trim().min(1).max(128);
export const equipmentSerialSchema = z.string().min(1).max(128).refine((value) => value.trim().length > 0, 'Serial must not be blank');
// Preserve raw serial/scan text separately. Scope uniqueness by canonical manufacturer + product.
export const normalizeEquipmentSerial = (raw: string): string => raw.trim().toUpperCase();
export const scanMethodSchema = z.enum(['CAMERA', 'SCANNER', 'TYPED']);
export const unitStatusSchema = z.enum(['AVAILABLE', 'RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'QUARANTINED', 'RETURNED']);
export const allocationStatusSchema = z.enum(['RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RELEASED']);
export const dispatchStatusSchema = z.enum(['DRAFT', 'DISPATCHED', 'DELIVERED']);

export const stockReceiptLineSchema = z.object({
  productId: z.uuid(), quantity: positiveQuantitySchema, unitCost: moneySchema,
  zeroCostReason: z.string().trim().min(5).max(500).optional(),
  serials: z.array(equipmentSerialSchema).max(200).default([]),
}).strict().superRefine((line, ctx) => {
  if (/^0(?:\.0{1,2})?$/.test(line.unitCost) && !line.zeroCostReason) {
    ctx.addIssue({ code: 'custom', path: ['zeroCostReason'], message: 'Document the reason for a zero acquisition cost' });
  }
  if (line.serials.length && (!/^(0|[1-9]\d*)(?:\.0{1,3})?$/.test(line.quantity)
    || BigInt(line.quantity.split('.')[0]!) !== BigInt(line.serials.length))) {
    ctx.addIssue({ code: 'custom', path: ['serials'], message: 'When serials are supplied, their count must equal a whole-number quantity' });
  }
});
// The service must reject receivedAt > serverNow and record the staff actor.
export const receiveStockRequestSchema = z.object({
  reference, locationId: z.uuid(), receivedAt: z.iso.datetime({ offset: true }), lines: z.array(stockReceiptLineSchema).min(1).max(100),
}).strict().superRefine((receipt, ctx) => {
  const seen = new Set<string>();
  receipt.lines.forEach((line, i) => line.serials.forEach((serial, j) => {
    const key = `${line.productId}:${normalizeEquipmentSerial(serial)}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['lines', i, 'serials', j], message: 'Duplicate normalized serial for this product' });
    seen.add(key);
  }));
});
export type ReceiveStockRequest = z.infer<typeof receiveStockRequestSchema>;

// Server-owned source requirements. Public commands must not accept a client BOM or paid flag.
export const allocationSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('QUOTE_LINE'), quoteLineId: z.uuid() }).strict(),
  z.object({ kind: z.literal('TICKET_LINE'), ticketLineId: z.uuid() }).strict(),
]);
export type AllocationSource = z.infer<typeof allocationSourceSchema>;
export const allocateOrderRequestSchema = z.object({ expectedVersion: version, unitIds: uuidList.optional() }).strict();
export const reserveTicketPartsRequestSchema = z.object({ expectedVersion: version, ticketLineId: z.uuid(), unitIds: uuidList.optional() }).strict();
export const allocationViewSchema = z.object({
  id: z.uuid(), jobId: z.uuid(), productId: z.uuid(), source: allocationSourceSchema,
  unitId: z.uuid().nullable(), quantity: positiveQuantitySchema, status: allocationStatusSchema,
}).refine((value) => value.unitId === null || /^1(?:\.0{1,3})?$/.test(value.quantity), {
  path: ['quantity'], message: 'A physical unit allocation must have quantity one',
});

const signedQuantity = z.string().regex(/^-?(0|[1-9]\d{0,8})(\.\d{1,3})?$/)
  .refine((value) => !/^-0(?:\.0{1,3})?$/.test(value), 'Serialize zero without a negative sign');
export const stockSummarySchema = z.object({
  productId: z.uuid(), onHand: quantitySchema, reserved: quantitySchema, free: signedQuantity, asOf: z.iso.datetime({ offset: true }),
});
// A negative free balance is exposed honestly, not clamped to zero; services block allocation on shortage.
export const unitViewSchema = z.object({
  id: z.uuid(), productId: z.uuid(), manufacturerId: z.uuid(), manufacturer: z.string().min(1), serial: equipmentSerialSchema,
  normalizedSerial: z.string().min(1), status: unitStatusSchema,
});
export const recordScanRequestSchema = z.object({
  rawValue: z.string().min(1).max(512).refine((value) => value.trim().length > 0, 'Scan must not be blank'),
  method: scanMethodSchema, unitId: z.uuid().optional(),
}).strict();
export const scanRecordSchema = z.object({
  id: z.uuid(), unitId: z.uuid(), rawValue: z.string().min(1), normalizedSerial: z.string().min(1),
  method: scanMethodSchema, actorId: z.uuid(), recordedAt: z.iso.datetime({ offset: true }), countsForDispatch: z.boolean(),
}).refine((scan) => scan.method !== 'TYPED' || !scan.countsForDispatch, {
  path: ['countsForDispatch'], message: 'Typed input cannot satisfy a required equipment scan',
});
export const dispatchRequestSchema = z.object({ expectedVersion: version }).strict();
// The service additionally enforces dispatchedAt <= deliveredAt <= serverNow and records actor.
export const deliverDispatchRequestSchema = z.object({ expectedVersion: version, deliveredAt: z.iso.datetime({ offset: true }) }).strict();
export const dispatchViewSchema = z.object({
  id: z.uuid(), orderId: z.uuid(), jobId: z.uuid(), status: dispatchStatusSchema, version,
  dispatchedAt: z.iso.datetime({ offset: true }).nullable(), deliveredAt: z.iso.datetime({ offset: true }).nullable(),
  allocations: z.array(allocationViewSchema), scans: z.array(scanRecordSchema),
});
export const returnUnitRequestSchema = z.object({
  expectedVersion: version, unitId: z.uuid(), ticketLineId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
  disposition: z.enum(['QUARANTINE', 'RETURN_TO_STOCK']).default('QUARANTINE'),
}).strict();
// General unused-installation and bulk returns reference the canonical issued
// allocation; service returns may reference a ticket line. One return service
// must validate the source, remaining quantity, unit and cost reversal.
export const returnStockRequestSchema = z.object({
  expectedVersion: version,
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ALLOCATION'), allocationId: z.uuid() }).strict(),
    z.object({ kind: z.literal('TICKET_LINE'), ticketLineId: z.uuid() }).strict(),
  ]),
  unitId: z.uuid().nullable(), quantity: positiveQuantitySchema,
  reason: z.string().trim().min(1).max(1000),
  disposition: z.enum(['QUARANTINE', 'RETURN_TO_STOCK']).default('QUARANTINE'),
}).strict().refine((value) => value.unitId === null || /^1(?:\.0{1,3})?$/.test(value.quantity), {
  path: ['quantity'], message: 'A physical unit return must have quantity one',
});
export const replacementStockRequestSchema = z.object({
  expectedVersion: version, ticketLineId: z.uuid(), oldUnitId: z.uuid(), newUnitId: z.uuid(),
}).strict().refine((value) => value.oldUnitId !== value.newUnitId, {
  path: ['newUnitId'], message: 'A replacement must be a different physical unit',
});
export type RecordScanRequest = z.infer<typeof recordScanRequestSchema>;
export type DeliverDispatchRequest = z.infer<typeof deliverDispatchRequestSchema>;
export type ReplacementStockRequest = z.infer<typeof replacementStockRequestSchema>;

export type StockReceiptLine = z.infer<typeof stockReceiptLineSchema>;
export type AllocateOrderRequest = z.infer<typeof allocateOrderRequestSchema>;
export type ReserveTicketPartsRequest = z.infer<typeof reserveTicketPartsRequestSchema>;
export type AllocationView = z.infer<typeof allocationViewSchema>;
export type StockSummary = z.infer<typeof stockSummarySchema>;
export type UnitView = z.infer<typeof unitViewSchema>;
export type ScanRecord = z.infer<typeof scanRecordSchema>;
export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;
export type DispatchView = z.infer<typeof dispatchViewSchema>;
export type ReturnUnitRequest = z.infer<typeof returnUnitRequestSchema>;
export type ReturnStockRequest = z.infer<typeof returnStockRequestSchema>;

export const stockLocationKindSchema = z.enum(['USABLE', 'QUARANTINE']);
export const stockLocationViewSchema = z.object({
  id: z.uuid(), code: z.string().min(1), name: z.string().min(1), kind: stockLocationKindSchema,
});
export const stockLocationListResponseSchema = z.object({ data: z.array(stockLocationViewSchema) });
export const stockLevelListQuerySchema = z.object({
  productId: z.uuid().optional(), locationId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const stockLevelViewSchema = z.object({
  productId: z.uuid(), sku: z.string().min(1), productName: z.string().min(1), locationId: z.uuid(),
  locationCode: z.string().min(1), locationKind: stockLocationKindSchema, onHand: quantitySchema,
});
export const stockLevelListResponseSchema = z.object({ data: z.object({
  items: z.array(stockLevelViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
}) });
export const stockReceiptViewSchema = z.object({
  id: z.uuid(), reference: z.string().min(1), status: z.literal('DONE'), locationId: z.uuid(), actorId: z.uuid(),
  receivedAt: z.iso.datetime({ offset: true }), recordedAt: z.iso.datetime({ offset: true }),
  lines: z.array(z.object({
    id: z.uuid(), productId: z.uuid(), quantity: positiveQuantitySchema, unitCost: moneySchema,
    zeroCostReason: z.string().nullable(), movementId: z.uuid(), unitIds: z.array(z.uuid()),
  })),
});
export const stockReceiptResponseSchema = z.object({ data: stockReceiptViewSchema });
export const unitLookupQuerySchema = z.object({ serial: equipmentSerialSchema, productId: z.uuid().optional() }).strict();
// Location comes from the unit's latest movement; null means the unit has left company stock.
export const unitLocationViewSchema = unitViewSchema.extend({ locationId: z.uuid().nullable() });
export const unitLookupResponseSchema = z.object({ data: z.array(unitLocationViewSchema) });
export type StockLocationView = z.infer<typeof stockLocationViewSchema>;
export type StockLevelListQuery = z.infer<typeof stockLevelListQuerySchema>;
export type StockLevelView = z.infer<typeof stockLevelViewSchema>;
export type StockReceiptView = z.infer<typeof stockReceiptViewSchema>;
export type UnitLookupQuery = z.infer<typeof unitLookupQuerySchema>;
export type UnitLocationView = z.infer<typeof unitLocationViewSchema>;
