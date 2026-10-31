import { z } from 'zod';
import { moneySchema, positiveQuantitySchema, quantitySchema, signedMoneySchema } from './shared';

const version = z.number().int().positive();
// PostgreSQL returns UUIDs in lower case, so a request's IDs are made to match before they're compared or hashed.
const canonicalId = z.uuid().transform((value) => value.toLowerCase());
const uuidList = z.array(canonicalId).max(200).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs are not allowed');
const reference = z.string().trim().min(1).max(128);
export const equipmentSerialSchema = z.string().min(1).max(128).refine((value) => value.trim().length > 0, 'Serial must not be blank');
// Preserve raw serial/scan text separately. Scope uniqueness by canonical manufacturer + product.
export const normalizeEquipmentSerial = (raw: string): string => raw.trim().toUpperCase();
export const scanMethodSchema = z.enum(['CAMERA', 'SCANNER', 'TYPED']);
export const unitStatusSchema = z.enum(['AVAILABLE', 'RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'QUARANTINED', 'RETURNED']);
export const allocationStatusSchema = z.enum(['RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RELEASED']);
export const dispatchStatusSchema = z.enum(['DRAFT', 'DISPATCHED', 'DELIVERED']);

export const stockReceiptLineSchema = z.object({
  productId: canonicalId, quantity: positiveQuantitySchema, unitCost: moneySchema,
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
  reference, locationId: canonicalId, receivedAt: z.iso.datetime({ offset: true }), lines: z.array(stockReceiptLineSchema).min(1).max(100),
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
export const releaseOrderAllocationsRequestSchema = z.object({ expectedVersion: version, reason: z.string().trim().min(5).max(500) }).strict();
export type ReleaseOrderAllocationsRequest = z.infer<typeof releaseOrderAllocationsRequestSchema>;
export const reserveTicketPartsRequestSchema = z.object({ expectedVersion: version, ticketLineId: z.uuid(), unitIds: uuidList.optional() }).strict();
export const allocationViewSchema = z.object({
  id: z.uuid(), jobId: z.uuid(), productId: z.uuid(), source: allocationSourceSchema,
  unitId: z.uuid().nullable(), quantity: positiveQuantitySchema, status: allocationStatusSchema,
  releaseEvidence: z.object({ releasedAt: z.iso.datetime({ offset: true }), releasedById: z.uuid(), reason: z.string().min(5).max(500) }).nullable().optional(),
}).refine((value) => value.unitId === null || /^1(?:\.0{1,3})?$/.test(value.quantity), {
  path: ['quantity'], message: 'A physical unit allocation must have quantity one',
});
export const allocationListResponseSchema = z.object({ data: z.array(allocationViewSchema) });
export const releaseOrderAllocationsResponseSchema = z.object({ data: z.object({
  jobId: z.uuid(), jobVersion: version, releasedById: z.uuid(), releasedAt: z.iso.datetime({ offset: true }),
  reason: z.string().min(5).max(500), allocations: z.array(allocationViewSchema),
}) });

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
  method: scanMethodSchema, unitId: canonicalId.optional(),
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
export const createDispatchRequestSchema = z.object({ expectedVersion: version }).strict();
export type CreateDispatchRequest = z.infer<typeof createDispatchRequestSchema>;
// Scan completeness does not imply dispatch posting or cost integration is available.
export const dispatchResponseSchema = z.object({ data: dispatchViewSchema.extend({
  scanReadiness: z.object({ reservationValid: z.boolean(), requiredUnitIds: z.array(z.uuid()), missingUnitIds: z.array(z.uuid()), complete: z.boolean() }),
  // One row per serial unit once delivered. NO_POLICY means the accepted quote froze no warranty terms for that product.
  coverage: z.array(z.object({
    unitId: z.uuid(), status: z.enum(['ACTIVE', 'NO_POLICY']), startDate: z.iso.date().nullable(), expiryDate: z.iso.date().nullable(), policyName: z.string().nullable(),
  })),
}) });
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
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const stockLevelViewSchema = z.object({
  productId: z.uuid(), sku: z.string().min(1), productName: z.string().min(1), locationId: z.uuid(),
  locationCode: z.string().min(1), locationKind: stockLocationKindSchema, onHand: quantitySchema,
  // Free is usable on-hand minus RESERVED, so quarantine has none. A count can leave it negative, and that stays visible.
  reserved: quantitySchema, free: signedQuantity,
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
// Assignment is derived from Allocation -> Job -> Order, rather than copying customer identity onto a unit.
export const unitDetailViewSchema = unitLocationViewSchema.extend({
  receiptId: z.uuid(),
  replacesUnitId: z.uuid().nullable(),
  activeAssignment: z.object({
    allocationId: z.uuid(), status: allocationStatusSchema.exclude(['RELEASED']),
    jobId: z.uuid(), orderId: z.uuid(), customerId: z.uuid(),
  }).nullable(),
});
export const unitDetailResponseSchema = z.object({ data: unitDetailViewSchema });
export type UnitDetailView = z.infer<typeof unitDetailViewSchema>;
export type StockLocationView = z.infer<typeof stockLocationViewSchema>;
export type StockLevelListQuery = z.infer<typeof stockLevelListQuerySchema>;
export type StockLevelView = z.infer<typeof stockLevelViewSchema>;
export type StockReceiptView = z.infer<typeof stockReceiptViewSchema>;
export type UnitLookupQuery = z.infer<typeof unitLookupQuerySchema>;
export type UnitLocationView = z.infer<typeof unitLocationViewSchema>;

// One line per product, so each document line posts one movement and a shortage names one product.
const uniqueProducts = (lines: { productId: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    if (seen.has(line.productId)) ctx.addIssue({ code: 'custom', path: ['lines', i, 'productId'], message: 'List each product once' });
    seen.add(line.productId);
  });
};
export const stockTransferLineSchema = z.object({
  productId: canonicalId, quantity: positiveQuantitySchema, serials: z.array(equipmentSerialSchema).max(200).default([]),
}).strict().superRefine((line, ctx) => {
  if (line.serials.length && (!/^(0|[1-9]\d*)(?:\.0{1,3})?$/.test(line.quantity)
    || BigInt(line.quantity.split('.')[0]!) !== BigInt(line.serials.length))) {
    ctx.addIssue({ code: 'custom', path: ['serials'], message: 'When serials are supplied, their count must equal a whole-number quantity' });
  }
  if (new Set(line.serials.map(normalizeEquipmentSerial)).size !== line.serials.length) {
    ctx.addIssue({ code: 'custom', path: ['serials'], message: 'Duplicate normalized serial for this product' });
  }
});
export const createStockTransferRequestSchema = z.object({
  reference, fromLocationId: canonicalId, toLocationId: canonicalId, lines: z.array(stockTransferLineSchema).min(1).max(100),
}).strict().superRefine((transfer, ctx) => {
  if (transfer.fromLocationId === transfer.toLocationId) ctx.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Choose a different destination' });
  uniqueProducts(transfer.lines, ctx);
});
export const createStockCountRequestSchema = z.object({
  reference, locationId: canonicalId, lines: z.array(z.object({ productId: canonicalId, countedQuantity: quantitySchema }).strict()).min(1).max(100),
}).strict().superRefine((count, ctx) => uniqueProducts(count.lines, ctx));
export const stockDocumentCommandRequestSchema = z.object({ expectedVersion: version }).strict();
export const stockDocumentKindSchema = z.enum(['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT']);
export const stockDocumentStatusSchema = z.enum(['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED']);
// A count's location is toLocationId. Until it is validated, its quantity is zero and measuredQuantity is null.
export const stockDocumentViewSchema = z.object({
  id: z.uuid(), kind: stockDocumentKindSchema, reference: z.string().min(1), status: stockDocumentStatusSchema, version,
  fromLocationId: z.uuid().nullable(), toLocationId: z.uuid().nullable(), actorId: z.uuid(), validatedById: z.uuid().nullable(),
  occurredAt: z.iso.datetime({ offset: true }), recordedAt: z.iso.datetime({ offset: true }), validatedAt: z.iso.datetime({ offset: true }).nullable(),
  lines: z.array(z.object({
    id: z.uuid(), lineNumber: z.number().int().positive(), productId: z.uuid(), quantity: quantitySchema,
    countedQuantity: quantitySchema.nullable(), measuredQuantity: quantitySchema.nullable(), movementId: z.uuid().nullable(), unitIds: z.array(z.uuid()),
  })),
});
export const stockDocumentResponseSchema = z.object({ data: stockDocumentViewSchema });
export type CreateStockTransferRequest = z.infer<typeof createStockTransferRequestSchema>;
export type CreateStockCountRequest = z.infer<typeof createStockCountRequestSchema>;
export type StockDocumentCommandRequest = z.infer<typeof stockDocumentCommandRequestSchema>;
export type StockDocumentView = z.infer<typeof stockDocumentViewSchema>;

const timestamp = z.iso.datetime({ offset: true });
const paging = {
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const pageOf = <T extends z.ZodType>(item: T) => z.object({ data: z.object({
  items: z.array(item), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
}) });

// `from` is inclusive and `to` exclusive, on the movement's occurredAt. locationId matches either end of a movement.
export const stockMovementListQuerySchema = z.object({
  productId: canonicalId.optional(), locationId: canonicalId.optional(), kind: stockDocumentKindSchema.optional(),
  from: timestamp.optional(), to: timestamp.optional(), ...paging,
}).strict().refine((query) => !query.from || !query.to || Date.parse(query.from) < Date.parse(query.to), {
  path: ['to'], message: 'The end must be after the start',
});
export const stockMovementViewSchema = z.object({
  id: z.uuid(), productId: z.uuid(), sku: z.string().min(1), productName: z.string().min(1),
  fromLocationId: z.uuid().nullable(), toLocationId: z.uuid().nullable(), quantity: positiveQuantitySchema, actorId: z.uuid(),
  occurredAt: timestamp, recordedAt: timestamp, documentId: z.uuid(), documentKind: stockDocumentKindSchema, reference: z.string().min(1),
});
export const stockMovementListResponseSchema = pageOf(stockMovementViewSchema);

// As-of goes by occurredAt, so a receipt recorded late with an earlier date changes past answers. The service refuses a future time.
export const stockAsOfQuerySchema = z.object({ at: timestamp, productId: canonicalId.optional(), locationId: canonicalId.optional(), ...paging }).strict();
export const stockAsOfViewSchema = z.object({
  productId: z.uuid(), sku: z.string().min(1), productName: z.string().min(1), locationId: z.uuid(),
  locationCode: z.string().min(1), locationKind: stockLocationKindSchema, onHand: signedQuantity,
});
export const stockAsOfResponseSchema = z.object({ data: pageOf(stockAsOfViewSchema).shape.data.extend({ at: timestamp }) });

// Usable and quarantine are kept apart, because quarantined stock can't be sold. Serial units count at their actual cost,
// and bulk at today's moving average. costKnown is false when a bulk product has stock but no cost, which then counts as zero.
export const stockValueQuerySchema = z.object({ productId: canonicalId.optional(), ...paging }).strict();
export const stockValueViewSchema = z.object({
  productId: z.uuid(), sku: z.string().min(1), productName: z.string().min(1),
  usableQuantity: signedQuantity, quarantineQuantity: signedQuantity, usableValue: signedMoneySchema, quarantineValue: signedMoneySchema, costKnown: z.boolean(),
});
export const stockValueResponseSchema = z.object({ data: pageOf(stockValueViewSchema).shape.data.extend({
  usableValue: signedMoneySchema, quarantineValue: signedMoneySchema, uncostedProducts: z.number().int().nonnegative(),
}) });

export const stockIntegrityCheckSchema = z.object({
  code: z.string().min(1), description: z.string().min(1), ok: z.boolean(), count: z.number().int().nonnegative(), samples: z.array(z.string()).max(20),
});
export const stockIntegrityResponseSchema = z.object({ data: z.object({ checkedAt: timestamp, ok: z.boolean(), checks: z.array(stockIntegrityCheckSchema) }) });

export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
export type StockMovementView = z.infer<typeof stockMovementViewSchema>;
export type StockAsOfQuery = z.infer<typeof stockAsOfQuerySchema>;
export type StockAsOfView = z.infer<typeof stockAsOfViewSchema>;
export type StockValueQuery = z.infer<typeof stockValueQuerySchema>;
export type StockValueView = z.infer<typeof stockValueViewSchema>;
export type StockIntegrityCheck = z.infer<typeof stockIntegrityCheckSchema>;
