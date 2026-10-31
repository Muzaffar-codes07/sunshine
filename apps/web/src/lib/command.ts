import { useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { apiPost, ApiRequestError, newIdempotencyKey } from './api';

export type Problem = { messages: string[]; fields: Record<string, string> };
export const noProblem: Problem = { messages: [], fields: {} };

/** Lists every reason a command was refused, so staff can fix them all in one go. */
export function describeFailure(error: unknown): Problem {
  if (!(error instanceof ApiRequestError)) return { messages: [error instanceof Error ? error.message : 'Something went wrong. Try again.'], fields: {} };
  if (error.reasons.length) return { messages: error.reasons.map((reason) => `${reason.reason} ${reason.nextAction}`), fields: {} };
  const fields = Object.fromEntries(Object.entries(error.fieldErrors).map(([name, messages]) => [name.split('.').pop()!, messages[0] ?? 'Check this field']));
  return { messages: [Object.keys(fields).length ? 'Check the highlighted fields and try again.' : error.message], fields };
}

/** Checks input against the shared contract. Errors land on the field they name, in plain words where `messages` has them. */
export function checkInput<T>(schema: ZodType<T>, input: unknown, messages: Record<string, string> = {}): { data: T } | { problem: Problem } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const name = [...issue.path].reverse().find((part) => typeof part === 'string');
    const field = String(name ?? 'form');
    fields[field] ??= messages[field] ?? issue.message;
  }
  return { problem: { messages: ['Check the highlighted fields and try again.'], fields } };
}

type Intent = { path: string; body: unknown; key: string };

/** Posts a command needing an Idempotency-Key. If the response is lost, the same key and body are kept for the retry, so it can only take effect once. */
export function useRetrySafeCommand<T>(schema: ZodType<T>, refresh: QueryKey, onDone?: (result: T) => void) {
  const client = useQueryClient();
  const intent = useRef<Intent | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [problem, setProblem] = useState<Problem>(noProblem);

  async function send(saved: Intent) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true); setProblem(noProblem);
    try {
      const result = await apiPost(saved.path, schema, saved.body, { idempotencyKey: saved.key });
      intent.current = null; setUncertain(false);
      onDone?.(result);
      await client.invalidateQueries({ queryKey: refresh });
    } catch (error) {
      const definitive = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
      if (definitive) intent.current = null;
      setUncertain(!definitive); setProblem(describeFailure(error));
    } finally { sending.current = false; setBusy(false); }
  }

  return {
    busy, uncertain, problem, setProblem,
    run(path: string, body: unknown) {
      if (sending.current || intent.current) return;
      const saved = { path, body, key: newIdempotencyKey() };
      intent.current = saved; void send(saved);
    },
    retry() { if (intent.current && !sending.current) void send(intent.current); },
  };
}
