/** Coverage and billing must compare the same canonical scope. */
export function normalizeWarrantyScope(value: string): string {
  return value.trim().toUpperCase();
}
