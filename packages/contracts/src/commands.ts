import { z } from 'zod';

// Field rules shared by staff commands (enquiry queue, survey). Every command carries the version the user last
// saw; a stale version is refused with 409 STALE_VERSION instead of silently overwriting.

export const versionSchema = z.coerce.number<string | number>({ error: 'Version is required' })
  .int('Version must be a whole number').min(1, 'Version must be at least 1');

/** Non-negative decimal with at most `places` decimal places, sent to the database as a fixed-point string. */
export const decimalString = (label: string, max: number, places = 2) => {
  const Label = label.charAt(0).toUpperCase() + label.slice(1);
  // Number('') and Number('  ') are 0, so a blank field would silently become 0.00. Reject it first;
  // an explicit 0 is still accepted.
  const present = z.union([
    z.string({ error: `Enter ${label}` }).trim().min(1, `Enter ${label}`),
    z.number({ error: `Enter ${label}` }),
  ], { error: `Enter ${label}` });
  return present
    .pipe(z.coerce.number<string | number>({ error: `Enter ${label} as a number` })
      .refine(Number.isFinite, `Enter ${label} as a number`)
      .refine((value) => value >= 0, `${Label} cannot be negative`)
      .refine((value) => value <= max, `${Label} must be at most ${max}`)
      .refine((value) => Number(value.toFixed(places)) === value,
        `Use at most ${places} decimal place${places === 1 ? '' : 's'} for ${label}`))
    .transform((value) => value.toFixed(places));
};

export const reasonSchema = z.string({ error: 'Enter a reason' }).trim()
  .min(3, 'Reason must contain at least 3 characters').max(500, 'Reason must be at most 500 characters');
