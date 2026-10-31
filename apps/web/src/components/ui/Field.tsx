import { useId, type ReactNode } from 'react';

type FieldControl = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true };

export function Field({ label, hint, error, children }: {
  label: string;
  hint?: string;
  error?: string;
  children: (control: FieldControl) => ReactNode;
}) {
  const id = useId();
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {children({ id, 'aria-describedby': description, 'aria-invalid': error ? true : undefined })}
    {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="form-error">{error}</p>}
  </div>;
}
