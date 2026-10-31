import { z } from 'zod';
import { systemTypeSchema } from './sales';
import { moneySchema, positiveQuantitySchema } from './shared';

export const productKindSchema = z.enum(['HARDWARE', 'SERVICE']);
export const productTrackingModeSchema = z.enum(['SERIALIZED', 'BULK', 'NONE']);
export const unitOfMeasureSchema = z.enum(['PCS', 'SET', 'M', 'JOB']);
export const productCategorySchema = z.enum(['PANEL', 'INVERTER', 'CHARGE_CONTROLLER', 'BATTERY', 'MOUNTING', 'WIRING_BOX', 'SWITCHGEAR', 'CABLE', 'EARTHING', 'CONNECTOR', 'INSTALLATION', 'OTHER']);
export const manufacturerViewSchema = z.object({ id: z.uuid(), name: z.string().min(1) });
export const productViewSchema = z.object({
  id: z.uuid(), sku: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/), name: z.string().min(1),
  kind: productKindSchema, category: productCategorySchema, trackingMode: productTrackingModeSchema,
  unitOfMeasure: unitOfMeasureSchema, manufacturerId: z.uuid().nullable(), manufacturer: manufacturerViewSchema.nullable(),
  unitSalePrice: moneySchema, active: z.boolean(),
}).superRefine((product, ctx) => {
  if (product.manufacturerId !== (product.manufacturer?.id ?? null)) ctx.addIssue({ code: 'custom', path: ['manufacturerId'], message: 'Manufacturer identity must match the product' });
  if (product.kind === 'HARDWARE' && (product.trackingMode === 'NONE' || !product.manufacturerId)) ctx.addIssue({ code: 'custom', path: ['trackingMode'], message: 'Hardware requires a manufacturer and stock tracking' });
  if (product.kind === 'SERVICE' && (product.trackingMode !== 'NONE' || product.manufacturerId !== null || product.unitOfMeasure !== 'JOB')) ctx.addIssue({ code: 'custom', path: ['trackingMode'], message: 'Services are untracked jobs, not physical equipment' });
  if (product.trackingMode === 'SERIALIZED' && product.unitOfMeasure !== 'PCS') ctx.addIssue({ code: 'custom', path: ['unitOfMeasure'], message: 'Serialized equipment uses whole physical pieces' });
});
export type ProductView = z.infer<typeof productViewSchema>;
const page = z.coerce.number<string | number>().int().min(1).max(10000).default(1);
const pageSize = z.coerce.number<string | number>().int().min(1).max(100).default(25);
export const productListQuerySchema = z.object({
  page, pageSize, kind: productKindSchema.optional(), trackingMode: productTrackingModeSchema.optional(),
  manufacturerId: z.uuid().optional(), sku: z.string().trim().toUpperCase().min(2).max(64).optional(),
}).strict();
export type ProductListQuery = z.output<typeof productListQuerySchema>;
export const productListResponseSchema = z.object({ data: z.object({ items: z.array(productViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() }) });
export const productResponseSchema = z.object({ data: productViewSchema });
export const packageListQuerySchema = z.object({
  page, pageSize, systemType: systemTypeSchema.optional(),
  capacityKw: z.union([z.string(), z.number()]).pipe(z.coerce.number<string | number>().int().min(1).max(5)).optional(),
}).strict();
export type PackageListQuery = z.output<typeof packageListQuerySchema>;
export const packageSummarySchema = z.object({
  id: z.uuid(), code: z.string().min(1), name: z.string().min(1), capacityKw: z.number().int().min(1).max(5),
  systemType: systemTypeSchema, revision: z.number().int().positive(), active: z.boolean(),
  hardwarePrice: moneySchema, installationPrice: moneySchema, totalPrice: moneySchema, installationProductId: z.uuid(),
});
export const packageDetailSchema = packageSummarySchema.extend({
  installationProduct: productViewSchema,
  items: z.array(z.object({ id: z.uuid(), productId: z.uuid(), position: z.number().int().positive(), quantity: positiveQuantitySchema, product: productViewSchema })).min(1),
}).superRefine((kit, ctx) => {
  if (kit.installationProductId !== kit.installationProduct.id || kit.installationProduct.kind !== 'SERVICE') ctx.addIssue({ code: 'custom', path: ['installationProduct'], message: 'Installation must reference the included service product' });
  if (kit.active && (!kit.installationProduct.active || kit.items.some((item) => !item.product.active))) ctx.addIssue({ code: 'custom', path: ['active'], message: 'A current package must contain current catalogue products' });
  const cents = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  if ([kit.hardwarePrice, kit.installationPrice, kit.totalPrice].every((value) => moneySchema.safeParse(value).success) && cents(kit.hardwarePrice) + cents(kit.installationPrice) !== cents(kit.totalPrice)) ctx.addIssue({ code: 'custom', path: ['totalPrice'], message: 'The total must equal hardware plus installation' });
  const seen = new Set<string>();
  kit.items.forEach((item, index) => {
    if (seen.has(item.productId) || item.productId !== item.product.id || item.product.kind !== 'HARDWARE') ctx.addIssue({ code: 'custom', path: ['items', index], message: 'BOM items must uniquely reference physical catalogue products' });
    seen.add(item.productId);
    if (item.product.trackingMode === 'SERIALIZED' && !/^[1-9][0-9]*(?:\.0{1,3})?$/.test(item.quantity)) ctx.addIssue({ code: 'custom', path: ['items', index, 'quantity'], message: 'Serialized equipment requires a whole-number quantity' });
  });
  const categories = new Set(kit.items.map((item) => item.product.category));
  for (const category of ['PANEL', 'INVERTER', 'CHARGE_CONTROLLER', 'MOUNTING', 'WIRING_BOX', 'SWITCHGEAR', 'CABLE', 'EARTHING', 'CONNECTOR']) {
    if (!categories.has(category as z.infer<typeof productCategorySchema>)) ctx.addIssue({ code: 'custom', path: ['items'], message: `The complete kit must include ${category.toLowerCase().replaceAll('_', ' ')}` });
  }
  if ((kit.systemType === 'OFF_GRID') !== categories.has('BATTERY')) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Off-Grid kits require a battery; On-Grid kits follow the battery-free PDF template' });
});
export type PackageDetail = z.infer<typeof packageDetailSchema>;
export const packageListResponseSchema = z.object({ data: z.object({ items: z.array(packageSummarySchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive() }) });
export const packageResponseSchema = z.object({ data: packageDetailSchema });
