import { Check } from 'lucide-react';
import { projectStageSchema } from '@sunshine/contracts';
import { formatInr } from '../dashboard/dashboard-model';
import { describeProblem, humanize, useProjectSummary } from './queries';

/** Where this customer stands from enquiry to payment, and the one next step for staff. Read-only. */
export function SummaryPanel({ enquiryId }: { enquiryId: string }) {
  const summary = useProjectSummary(enquiryId);
  if (summary.isPending) return <p role="status">Loading project summary…</p>;
  if (summary.error) return <div role="alert"><p>{describeProblem(summary.error).message}</p><button onClick={() => void summary.refetch()}>Retry</button></div>;
  const { stage, nextStep, survey, quote, order, invoice } = summary.data.data;
  const stages = projectStageSchema.options, current = stages.indexOf(stage);

  return <section className="progress-hero" aria-label="Project progress">
    <ol className="stage-steps" aria-label={`Stage ${current + 1} of ${stages.length}`}>
      {stages.map((value, index) => <li key={value} className={index < current ? 'is-done' : index === current ? 'is-now' : ''} aria-current={index === current ? 'step' : undefined}>
        <span className="step-dot" aria-hidden="true">{index < current ? <Check size="0.875rem" strokeWidth={3} /> : index + 1}</span>{humanize(value)}
      </li>)}
    </ol>
    <div className="hero-next"><span>Next step</span><strong>{nextStep.text}</strong></div>
    <dl className="hero-facts">
      <div><dt>Survey</dt><dd>{survey ? `${humanize(survey.status)}, revision ${survey.revision}` : 'Not scheduled'}</dd></div>
      <div><dt>Quote</dt><dd>{quote ? `${humanize(quote.status)}, ${formatInr(quote.totalPrice)}` : 'None yet'}</dd></div>
      <div><dt>Order</dt><dd>{order ? `${order.displayNumber}${order.released ? '' : ', awaiting advance'}` : 'Not confirmed'}</dd></div>
      <div><dt>Invoice</dt><dd>{invoice ? `${formatInr(invoice.paidAmount)} paid of ${formatInr(invoice.total)}` : 'None yet'}</dd></div>
    </dl>
  </section>;
}
