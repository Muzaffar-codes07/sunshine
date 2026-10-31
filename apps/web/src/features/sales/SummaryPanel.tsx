import { projectStageSchema } from '@sunshine/contracts';
import { SummaryPattern } from '../../components/shared/patterns';
import { describeProblem, formatWhen, humanize, useProjectSummary } from './queries';

const inr = (amount: string) => `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Where this customer stands from enquiry to payment, and the one next step for staff. Read-only. */
export function SummaryPanel({ enquiryId }: { enquiryId: string }) {
  const summary = useProjectSummary(enquiryId);
  if (summary.isPending) return <p role="status">Loading project summary…</p>;
  if (summary.error) return <div role="alert"><p>{describeProblem(summary.error).message}</p><button onClick={() => void summary.refetch()}>Retry</button></div>;
  const { stage, nextStep, survey, quote, order, invoice } = summary.data.data;
  const stages = projectStageSchema.options;

  return <SummaryPattern title="Project progress" note={<strong>Next step: {nextStep.text}</strong>} entries={[
    { id: 'stage', label: 'Stage', value: <ol className="stage-track" aria-label={`Stage ${stages.indexOf(stage) + 1} of ${stages.length}`}>
      {stages.map((value) => <li key={value} aria-current={value === stage ? 'step' : undefined}>{humanize(value)}</li>)}
    </ol> },
    { id: 'survey', label: 'Survey', value: survey ? `Revision ${survey.revision}: ${humanize(survey.status)} (${survey.technicianName}, ${formatWhen(survey.scheduledFor)})` : 'Not scheduled' },
    { id: 'quote', label: 'Quote', value: quote ? `Revision ${quote.revision}: ${humanize(quote.status)}, ${inr(quote.totalPrice)}` : 'None yet' },
    { id: 'order', label: 'Order', value: order ? `${order.displayNumber}${order.released ? ', released' : ', awaiting advance'}` : 'Not confirmed' },
    { id: 'invoice', label: 'Invoice', value: invoice ? `${invoice.displayNumber}: ${inr(invoice.paidAmount)} paid of ${inr(invoice.total)}, balance ${inr(invoice.balance)}` : '—' },
  ]} />;
}
