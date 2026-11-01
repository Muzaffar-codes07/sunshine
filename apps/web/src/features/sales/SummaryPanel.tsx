import { projectStageSchema } from '@sunshine/contracts';
import { StageHero } from '../../components/shared/StageHero';
import { formatInr } from '../dashboard/dashboard-model';
import { describeProblem, humanize, useProjectSummary } from './queries';

/** Where this customer stands from enquiry to payment, and the one next step for staff. Read-only. */
export function SummaryPanel({ enquiryId }: { enquiryId: string }) {
  const summary = useProjectSummary(enquiryId);
  if (summary.isPending) return <p role="status">Loading project summary…</p>;
  if (summary.error) return <div role="alert"><p>{describeProblem(summary.error).message}</p><button onClick={() => void summary.refetch()}>Retry</button></div>;
  const { stage, nextStep, survey, quote, order, invoice } = summary.data.data;
  const stages = projectStageSchema.options, current = stages.indexOf(stage);

  return <StageHero label="Project progress" stages={stages.map(humanize)} current={current} next={nextStep.text} facts={[
    { id: 'survey', label: 'Survey', value: survey ? `${humanize(survey.status)}, revision ${survey.revision}` : 'Not scheduled' },
    { id: 'quote', label: 'Quote', value: quote ? `${humanize(quote.status)}, ${formatInr(quote.totalPrice)}` : 'None yet' },
    { id: 'order', label: 'Order', value: order ? `${order.displayNumber}${order.released ? '' : ', awaiting advance'}` : 'Not confirmed' },
    { id: 'invoice', label: 'Invoice', value: invoice ? `${formatInr(invoice.paidAmount)} paid of ${formatInr(invoice.total)}` : 'None yet' },
  ]} />;
}
