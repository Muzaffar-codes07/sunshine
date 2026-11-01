import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ZodType } from 'zod';
import { ActionDrawer, FormPattern } from '../../components/shared/patterns';
import { describeProblem, useSalesCommand, validate, type Problem } from './queries';

/**
 * A button that opens a drawer holding one command form. Input is checked against the shared contract first, then
 * posted; refusals show their reason and next step, and field errors land next to their fields.
 */
export function CommandDrawer<T>({ label, title, submitLabel, enquiryId, path, schema, responseSchema, build, children, primary = false }: {
  primary?: boolean; label: string; title: string; submitLabel: string; enquiryId?: string; path: string;
  schema: ZodType<unknown>; responseSchema: ZodType<T>; build: (form: FormData) => unknown;
  children: (fields: Record<string, string[]>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<Problem>({ message: '', fields: {} });
  // The form shows the record as it was when opened, so it must submit that version too: a refetch while it is
  // open must not move the version forward under stale inputs, or another person's change would be overwritten.
  const atOpen = useRef({ build, path });
  const command = useSalesCommand(enquiryId, responseSchema);

  function show() { atOpen.current = { build, path }; setOpen(true); }
  function close() { setOpen(false); setProblem({ message: '', fields: {} }); }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.isPending) return;
    const checked = validate(schema, atOpen.current.build(new FormData(event.currentTarget)));
    if ('problem' in checked) { setProblem(checked.problem); return; }
    setProblem({ message: '', fields: {} });
    command.mutate({ path: atOpen.current.path, body: checked.data }, { onSuccess: close, onError: (error) => setProblem(describeProblem(error)) });
  }

  return <>
    <button type="button" className={primary ? 'button-primary' : undefined} onClick={show}>{label}</button>
    <ActionDrawer open={open} title={title} onClose={close}>
      {open && <FormPattern title={title} onSubmit={submit} pending={command.isPending} error={problem.message || undefined} submitLabel={submitLabel}>
        {children(problem.fields)}
      </FormPattern>}
    </ActionDrawer>
  </>;
}

/** A one-click command (no form), such as "Mark contacted" or "Approve survey". */
export function CommandButton<T>({ label, enquiryId, path, body, responseSchema, primary = false }: {
  primary?: boolean; label: string; enquiryId?: string; path: string; body: unknown; responseSchema: ZodType<T>;
}) {
  const command = useSalesCommand(enquiryId, responseSchema);
  return <span className="command-button">
    <button type="button" className={primary ? 'button-primary' : undefined} disabled={command.isPending} onClick={() => command.mutate({ path, body })}>{command.isPending ? 'Saving…' : label}</button>
    {command.error && <span className="form-error" role="alert"> {describeProblem(command.error).message}</span>}
  </span>;
}
