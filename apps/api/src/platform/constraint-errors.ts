import { HttpStatus } from '@nestjs/common';
import type { RefusalReason } from '@sunshine/contracts';
import { ApiError, refusal } from './api-error';

// Shared mapping from database constraint refusals to business errors (D2, API standards). Services validate and
// lock first; these rules are the backstop when a race or a missed check reaches the database.
//
// Prisma 7 with the pg driver adapter raises P2002 (unique), P2003 (foreign key), P2039 (CHECK through the client)
// or P2010 (raw SQL). The SQLSTATE and constraint are in meta.driverAdapterError.cause; that cause also holds the
// failing row, so nothing from it except the constraint name may reach a response or a log.

export type ConstraintKind = 'unique' | 'foreign_key' | 'check' | 'exclusion';

export interface ConstraintViolation {
  kind: ConstraintKind;
  constraint: string | null;
}

const KINDS: Record<string, ConstraintKind> = { '23505': 'unique', '23503': 'foreign_key', '23514': 'check', '23P01': 'exclusion' };

/** Reads the SQLSTATE and constraint name from a Prisma error, or returns null for anything else. */
export function readConstraintViolation(error: unknown): ConstraintViolation | null {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: Record<string, unknown> } } } | null)
    ?.meta?.driverAdapterError?.cause;
  const kind = typeof cause?.originalCode === 'string' ? KINDS[cause.originalCode] : undefined;
  if (!cause || !kind) return null;
  const index = (cause.constraint as { index?: unknown } | undefined)?.index;
  const named = typeof cause.originalMessage === 'string' ? /constraint "([^"]+)"/.exec(cause.originalMessage)?.[1] : undefined;
  return { kind, constraint: typeof index === 'string' ? index : named ?? null };
}

/** A CHECK that guards one input field becomes a 400 on that field; any other rule becomes a 409 refusal. */
export type ConstraintRule = { field: string; message: string } | { refusal: RefusalReason };

/**
 * Keyed by constraint name. Every rule in prisma/required-constraints.json owned by D2 must have an entry (a unit
 * test checks this); other owners add theirs here in the PR that adds the constraint.
 */
export const CONSTRAINT_RULES: Record<string, ConstraintRule> = {
  manufacturers_name_not_blank: { field: 'name', message: 'Enter the manufacturer name' },
  products_sku_format: { field: 'sku', message: 'Use 2–64 uppercase letters, digits, hyphens or underscores for the SKU' },
  products_name_not_blank: { field: 'name', message: 'Enter the product name' },
  products_price_nonnegative: { field: 'unitSalePrice', message: 'Enter a finite nonnegative sale price' },
  products_tracking_consistent: { refusal: {
    code: 'PRODUCT_CONFIGURATION_INVALID', reason: 'The product kind, manufacturer and tracking facts do not agree.', source: 'CATALOGUE',
    nextAction: 'Review the hardware manufacturer and stock tracking, or configure an untracked service job.',
  } },
  products_serialized_uom: { field: 'unitOfMeasure', message: 'Serialized equipment must use PCS' },
  packages_capacity_range: { field: 'capacityKw', message: 'Choose a capacity from 1 to 5 kW' },
  packages_revision_positive: { field: 'revision', message: 'Revision must be at least 1' },
  packages_name_not_blank: { field: 'name', message: 'Enter the package name' },
  packages_prices_nonnegative: { refusal: {
    code: 'PACKAGE_PRICE_INVALID', reason: 'The package prices must be finite, nonnegative and within the supported total.', source: 'CATALOGUE',
    nextAction: 'Review the hardware and installation prices before publishing the package.',
  } },
  package_items_quantity_positive: { field: 'quantity', message: 'Enter a finite quantity greater than zero' },
  package_items_position_positive: { field: 'position', message: 'Position must be at least 1' },
  packages_one_active_revision: { refusal: {
    code: 'PACKAGE_REVISION_ACTIVE', reason: 'Another revision is already current for this capacity and system type.', source: 'CATALOGUE',
    nextAction: 'Retire the current revision in the same transaction before activating its replacement.',
  } },
  customers_name_not_blank: { field: 'name', message: 'Enter the customer name' },
  customers_phone_format: { field: 'phone', message: 'Enter a 10-digit Indian mobile number' },
  customers_pincode_format: { field: 'pincode', message: 'Enter a 6-digit PIN code' },
  customers_phone_key: { refusal: {
    code: 'CUSTOMER_PHONE_TAKEN', reason: 'A customer with this phone number already exists.', source: 'SALES',
    nextAction: 'Open the existing customer instead of creating a new one.',
  } },
  enquiries_capacity_range: { field: 'requestedCapacityKw', message: 'Choose a capacity from 1 to 5 kW' },
  enquiries_site_pincode_format: { field: 'pincode', message: 'Enter a 6-digit PIN code' },
  enquiries_roof_area_nonnegative: { field: 'shadowFreeRoofAreaSqm', message: 'Shadow-free roof area cannot be negative' },
  enquiries_bill_nonnegative: { field: 'monthlyBillInr', message: 'The monthly bill cannot be negative' },
  enquiries_version_positive: { field: 'version', message: 'Version must be at least 1' },
  enquiries_closed_has_reason: { field: 'reason', message: 'Give a reason when closing an enquiry' },
  units_identity_key: { refusal: {
    code: 'SERIAL_ALREADY_RECEIVED', reason: 'A unit with this manufacturer, product and serial already exists.', source: 'INVENTORY',
    nextAction: 'Check the serial, or open the existing unit.',
  } },
  users_email_key: { refusal: {
    code: 'STAFF_EMAIL_TAKEN', reason: 'A staff account with this email already exists.', source: 'AUTH',
    nextAction: 'Use a different email or reactivate the existing account.',
  } },
};

const FALLBACK: Record<ConstraintKind, RefusalReason> = {
  unique: {
    code: 'DUPLICATE_RECORD', reason: 'This would duplicate an existing record.', source: 'DATABASE',
    nextAction: 'Reload to see the current record, then try again if it is still needed.',
  },
  exclusion: {
    code: 'OVERLAPPING_RECORD', reason: 'This overlaps an existing record.', source: 'DATABASE',
    nextAction: 'Choose a time or item that does not overlap, then try again.',
  },
  foreign_key: {
    code: 'LINKED_RECORD_CONFLICT', reason: 'A linked record is missing or is still in use.', source: 'DATABASE',
    nextAction: 'Reload and check the linked records, then try again.',
  },
  check: {
    code: 'RULE_VIOLATION', reason: 'This change breaks a data rule.', source: 'DATABASE',
    nextAction: 'Reload, correct the values and try again.',
  },
};

/** Maps a database constraint refusal to the business error the client sees, or returns null if it is not one. */
export function constraintError(error: unknown): ApiError | null {
  const violation = readConstraintViolation(error);
  if (!violation) return null;
  const rule = violation.constraint ? CONSTRAINT_RULES[violation.constraint] : undefined;
  if (rule && 'field' in rule) {
    return new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { [rule.field]: [rule.message] });
  }
  return refusal(rule?.refusal ?? FALLBACK[violation.kind]);
}
