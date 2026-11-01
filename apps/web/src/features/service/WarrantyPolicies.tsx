import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productListResponseSchema, productWarrantyPolicyResponseSchema, saveWarrantyPolicyInputSchema,
  type ProductWarrantyPolicyResponse } from '@sunshine/contracts';
import { Field } from '../../components/ui/Field';
import { apiGet } from '../../lib/api';
import { useRetrySafeCommand } from '../../lib/command';
import { useStaffSession } from '../auth/session';
import { describeD4Error } from './d4-http';

function PolicyEditor({ saved, reload, hold }: { saved: ProductWarrantyPolicyResponse['data']; reload: () => void; hold: (value: boolean) => void }) {
  const policy = saved.policy;
  const command = useRetrySafeCommand(productWarrantyPolicyResponseSchema, ['warranty-policy', saved.productId]);
  const [savedMessage, setSavedMessage] = useState('');
  useEffect(() => { hold(command.busy || command.uncertain); }, [command.busy, command.uncertain, hold]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const parsed = saveWarrantyPolicyInputSchema.safeParse({ expectedFingerprint: saved.fingerprint,
      policyName: values.get('policyName'), revision: values.get('revision'), scope: values.get('scope'), durationMonths: Number(values.get('durationMonths')) });
    if (!parsed.success) {
      command.setProblem({ messages: ['Check the highlighted policy fields.'], fields: Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])) });
      return;
    }
    setSavedMessage('');
    command.run(`/warranty-policies/${saved.productId}`, parsed.data);
  }
  return <form onSubmit={submit} noValidate aria-busy={command.busy}>
    <p>{policy ? 'Saved terms apply to future quotes. Existing quotes and warranties retain their frozen terms.' : 'No terms configured. Enter approved terms before quoting this equipment.'}</p>
    <fieldset disabled={command.busy || command.uncertain}><legend>Product warranty terms</legend>
      <Field label="Policy name" error={command.problem.fields.policyName}>{control => <input {...control} name="policyName" defaultValue={policy?.policyName ?? ''} maxLength={200} required />}</Field>
      <Field label="Policy revision" hint="Use a new revision whenever the terms change." error={command.problem.fields.revision}>{control => <input {...control} name="revision" defaultValue={policy?.revision ?? ''} maxLength={100} required />}</Field>
      <Field label="Covered scope" hint="Name the covered work explicitly. Component coverage does not automatically cover labour." error={command.problem.fields.scope}>{control => <textarea {...control} name="scope" defaultValue={policy?.scope ?? ''} maxLength={2000} required />}</Field>
      <Field label="Duration in calendar months" error={command.problem.fields.durationMonths}>{control => <input {...control} name="durationMonths" type="number" min={1} max={1200} step={1} defaultValue={policy?.durationMonths ?? ''} required />}</Field>
      <button type="submit">{command.busy ? 'Saving…' : 'Save future warranty terms'}</button>
    </fieldset>
    {command.problem.messages.length > 0 && <div role="alert">{command.problem.messages.map(message => <p key={message}>{message}</p>)}</div>}
    {command.uncertain ? <><p role="status">The result is uncertain. Retry the saved request before editing these terms.</p><button type="button" disabled={command.busy} onClick={command.retry}>Retry saved policy request</button></>
      : <button type="button" disabled={command.busy} onClick={() => { reload(); setSavedMessage('Reloading saved terms…'); }}>Reload saved policy</button>}
    {savedMessage && <p role="status">{savedMessage}</p>}
  </form>;
}

function PolicySelection() {
  const [productId, setProductId] = useState('');
  const [held, setHeld] = useState(false);
  const [page, setPage] = useState(1);
  const products = useQuery({ queryKey: ['policy-products', page], retry: false,
    queryFn: ({ signal }) => apiGet(`/products?kind=HARDWARE&trackingMode=SERIALIZED&pageSize=50&page=${page}`, productListResponseSchema, signal) });
  const saved = useQuery({ queryKey: ['warranty-policy', productId], enabled: !!productId, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: ({ signal }) => apiGet(`/warranty-policies/${productId}`, productWarrantyPolicyResponseSchema, signal) });
  const data = products.data?.data;
  return <section aria-labelledby="warranty-policy-title"><h2 id="warranty-policy-title">Configure future warranty terms</h2>
    {products.isPending && <p role="status">Loading equipment products…</p>}
    {products.error && <div role="alert"><p>{describeD4Error(products.error)}</p><button onClick={() => void products.refetch()}>Retry products</button></div>}
    {data && <>
      {data.items.length === 0 ? <p>No serialized equipment products on this page.</p> : <Field label="Equipment product">{control => <select {...control} disabled={held} value={productId} onChange={event => setProductId(event.target.value)}>
        <option value="">Select equipment</option>{data.items.filter(product => product.active).map(product => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
      </select>}</Field>}
      {data.total > data.pageSize && <nav aria-label="Policy product pagination"><button disabled={held || page === 1} onClick={() => { setProductId(''); setPage(page - 1); }}>Previous products</button>
        <span>Page {page}</span><button disabled={held || page * data.pageSize >= data.total} onClick={() => { setProductId(''); setPage(page + 1); }}>Next products</button></nav>}
    </>}
    {saved.isFetching && productId && <p role="status">Loading saved policy…</p>}
    {saved.error && <div role="alert"><p>{describeD4Error(saved.error)}</p><button onClick={() => void saved.refetch()}>Retry policy</button></div>}
    {saved.data && !saved.error && <PolicyEditor key={`${productId}:${saved.data.data.fingerprint}`} saved={saved.data.data} reload={() => void saved.refetch()} hold={setHeld} />}
  </section>;
}

export function WarrantyPolicies() {
  const session = useStaffSession();
  return session.data?.role === 'ADMIN' ? <PolicySelection /> : null;
}
