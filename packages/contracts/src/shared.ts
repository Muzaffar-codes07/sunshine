import { z } from 'zod';

// numeric(14,2): at most 12 integer digits; callers round before serialization.
export const moneySchema = z.string().regex(
  /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/,
  'Expected a nonnegative decimal string with at most two decimal places',
);

// Internal unit costs retain the existing bulk moving-average precision. Posted money remains cents.
export const unitCostRateSchema = z.string().regex(
  /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/,
  'Expected a nonnegative unit cost with at most six decimal places',
);

export const signedMoneySchema = z.string().regex(
  /^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/,
  'Expected a decimal string with at most two decimal places',
).refine((value) => !/^-0(?:\.0{1,2})?$/.test(value), {
  message: 'Serialize zero without a negative sign',
});

// numeric(12,3): at most nine integer digits. Preserve exact quantities/hours
// as strings so downstream Decimal arithmetic never starts from binary floats.
export const quantitySchema = z.string().regex(
  /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/,
  'Expected a nonnegative decimal string with at most three decimal places',
);

export const positiveQuantitySchema = quantitySchema.refine((value) => /[1-9]/.test(value), {
  message: 'Quantity must be greater than zero',
});
