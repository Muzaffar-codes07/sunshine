/** Express accepts booleans, hop counts or named/address lists, not the literal strings true/false. */
export function parseTrustProxy(value?: string): boolean | number | string {
  const normalized = value?.trim();
  if (!normalized || normalized === 'false') return false;
  if (normalized === 'true') return true;
  if (/^[0-9]+$/.test(normalized)) {
    const hops = Number(normalized);
    if (!Number.isSafeInteger(hops)) throw new Error('TRUST_PROXY hop count must be a safe integer');
    return hops;
  }
  return normalized;
}
