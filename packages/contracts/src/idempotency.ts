import { z } from 'zod';

// Idempotent commands (TRD decision M6): order confirmation, payment receipt, dispatch, delivery, repair/replacement.
// The client sends a fresh key per user action (a UUID is ideal) and reuses it only when retrying that same action.

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export const idempotencyKeySchema = z.string({ error: `Send an ${IDEMPOTENCY_KEY_HEADER} header` }).trim()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, `${IDEMPOTENCY_KEY_HEADER} must be 8–128 letters, digits, "-" or "_"`);
