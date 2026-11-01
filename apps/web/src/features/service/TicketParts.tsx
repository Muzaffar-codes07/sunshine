import {useState,type FormEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {createTicketPartSchema,cancelTicketPartSchema,ticketPartCommandResponseSchema,ticketPartsResponseSchema,
  productListResponseSchema,type ServiceTicket} from '@sunshine/contracts';
import {useStaffSession} from '../auth/session';
import {Field} from '../../components/ui/Field';
import {CommandFeedback} from '../../components/shared/CommandFeedback';
import {apiGet} from '../../lib/api';
import {checkInput,useRetrySafeCommand} from '../../lib/command';
import {describeD4Error} from './d4-http';

export function TicketParts({ticket}:{ticket:ServiceTicket}){
  const session=useStaffSession();
  return session.data?.role==='ADMIN'?<AdminParts ticket={ticket}/>:null;
}

function AdminParts({ticket}:{ticket:ServiceTicket}){
  const [page,setPage]=useState(1),[productPage,setProductPage]=useState(1),[productId,setProductId]=useState('');
  const [lastAction,setLastAction]=useState<string|null>(null),[saved,setSaved]=useState('');
  const editable=ticket.sourceVerified && ['ASSESSED','IN_PROGRESS'].includes(ticket.status) && !ticket.billingFinalized && !ticket.replacedUnitId;
  const command=useRetrySafeCommand(ticketPartCommandResponseSchema,['service'],response=>setSaved(`Part requirement ${response.data.part.phase.toLowerCase()}.`));
  const parts=useQuery({queryKey:['service','parts',ticket.id,page],retry:false,
    queryFn:({signal})=>apiGet(`/tickets/${ticket.id}/parts?page=${page}&pageSize=20`,ticketPartsResponseSchema,signal)});
  const products=useQuery({queryKey:['service','part-products',productPage],retry:false,enabled:Boolean(editable),
    queryFn:({signal})=>apiGet(`/products?kind=HARDWARE&pageSize=50&page=${productPage}`,productListResponseSchema,signal)});
  const data=parts.data?.data,catalogue=products.data?.data;
  const disabled=command.busy||command.uncertain;
  function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(disabled)return;setLastAction(null);setSaved('');
    const values=new FormData(event.currentTarget);
    const input=checkInput(createTicketPartSchema,{version:ticket.version,productId,quantity:values.get('quantity'),scope:ticket.assessmentSnapshot?.requestedScope,reason:values.get('reason')});
    if('problem'in input)return command.setProblem(input.problem);
    command.run(`/tickets/${ticket.id}/parts`,input.data);
  }
  function cancel(event:FormEvent<HTMLFormElement>,id:string,version:number){
    event.preventDefault();if(disabled)return;setLastAction(id);setSaved('');
    const input=checkInput(cancelTicketPartSchema,{version:ticket.version,lineVersion:version,reason:new FormData(event.currentTarget).get('reason')});
    if('problem'in input)return command.setProblem(input.problem);
    command.run(`/tickets/${ticket.id}/parts/${id}/cancel`,input.data);
  }
  return <section aria-labelledby="ticket-parts-title">
    <h2 id="ticket-parts-title">Repair part requirements</h2>
    <p>Planning a part does not reserve stock or post an expense. Its catalogue selling price and assessed scope are frozen; actual cost remains unknown until issue.</p>
    {saved&&<p role="status">{saved}</p>}
    {parts.isPending&&<p role="status">Loading part requirements…</p>}
    {parts.error&&<div role="alert"><p>{describeD4Error(parts.error)}</p><button onClick={()=>void parts.refetch()}>Retry part requirements</button></div>}
    <fieldset disabled={disabled} style={{minWidth:0}}><legend>Saved requirements</legend>
      {data?.items.length===0&&<p>No repair parts have been requested.</p>}
      {data?.items.map(part=><article key={part.id} data-part-id={part.id} aria-label={part.product?.name??'Historical part'}>
        <h3>{part.product?.name??'Historical part — product unverified'}</h3>
        <dl><dt>Status</dt><dd>{part.phase}</dd><dt>Required quantity</dt><dd>{part.quantity}</dd>
          <dt>Assessed work scope</dt><dd>{part.scope??'Unverified historical scope'}</dd>
          <dt>Catalogue price per unit</dt><dd>{part.unitPrice===null?'No saved price':`₹${part.unitPrice}`}</dd>
          <dt>Customer billing</dt><dd>{part.phase==='LEGACY'?'Historical billability — unverified':part.billableToCustomer?'Chargeable after actual work billing':'Covered — no customer charge for this assessed scope'}</dd>
          <dt>{part.phase==='LEGACY'?'Recorded historical cost':'Actual part cost'}</dt><dd>{part.totalCost===null?'Not issued — no expense':`₹${part.totalCost}`}</dd></dl>
        <p>{part.description}</p>
        {part.phase==='LEGACY'&&<p role="status">This historical row needs source reconciliation. No product or stock movement has been inferred.</p>}
        {part.phase==='CANCELLED'&&<p>Cancelled: {part.cancellationReason}</p>}
        {editable&&part.phase==='PLANNED'&&<form noValidate onSubmit={event=>cancel(event,part.id,part.version)}>
          <Field label="Cancellation reason" error={lastAction===part.id?command.problem.fields.reason:undefined}>{control=><textarea {...control} name="reason" minLength={5} maxLength={500} required/>}</Field>
          <button type="submit">Cancel part requirement</button>
        </form>}
      </article>)}
      {data&&data.total>data.pageSize&&<nav aria-label="Part requirement pages"><button disabled={page===1} onClick={()=>setPage(page-1)}>Previous requirements</button><span>Page {page}</span><button disabled={page*data.pageSize>=data.total} onClick={()=>setPage(page+1)}>Next requirements</button></nav>}
    </fieldset>
    {editable&&<form noValidate onSubmit={create}>
      <fieldset disabled={disabled||products.isPending||!!products.error} style={{minWidth:0}}><legend>Add required part</legend>
        <p>Confirm this part is required for the saved scope: <strong>{ticket.assessmentSnapshot?.requestedScope}</strong>. Correct the assessment first if it is different work.</p>
        <Field label="Required repair product" error={lastAction===null?command.problem.fields.productId:undefined}>{control=><select {...control} value={productId} onChange={event=>setProductId(event.target.value)} required>
          <option value="">Choose stocked hardware</option>{catalogue?.items.filter(product=>product.active&&product.trackingMode!=='NONE').map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select>}</Field>
        {catalogue&&catalogue.total>catalogue.pageSize&&<nav aria-label="Repair product pages"><button type="button" disabled={productPage===1} onClick={()=>{setProductId('');setProductPage(productPage-1);}}>Previous products</button><span>Page {productPage}</span><button type="button" disabled={productPage*catalogue.pageSize>=catalogue.total} onClick={()=>{setProductId('');setProductPage(productPage+1);}}>Next products</button></nav>}
        <Field label="Required repair quantity" hint="One physical unit per serialized line; bulk quantities may use three decimals." error={lastAction===null?command.problem.fields.quantity:undefined}>{control=><input {...control} name="quantity" inputMode="decimal" defaultValue="1.000" required/>}</Field>
        <Field label="Why this part is required" error={lastAction===null?command.problem.fields.reason:undefined}>{control=><textarea {...control} name="reason" minLength={5} maxLength={500} required/>}</Field>
        <button type="submit">Save part requirement</button>
      </fieldset>
    </form>}
    {editable&&products.isPending&&<p role="status">Loading repair products…</p>}
    {editable&&products.error&&<div role="alert"><p>{describeD4Error(products.error)}</p><button onClick={()=>void products.refetch()}>Retry repair products</button></div>}
    <CommandFeedback problem={command.problem} uncertain={command.uncertain} busy={command.busy} onRetry={command.retry}/>
  </section>;
}
