import type { ReportPeriod, SubsidyReportMilestone } from '@sunshine/contracts';

export function formatMoney(amount: string): string {
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole = '0', fraction = '00'] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}₹${grouped}.${fraction.padEnd(2, '0')}`;
}

export function overviewCsvUrl(period: ReportPeriod): string {
  return `/api/v1/reports/export.csv?${new URLSearchParams({ report: 'overview', period }).toString()}`;
}

export function payCsvUrl(period: ReportPeriod): string {
  return `/api/v1/reports/export.csv?${new URLSearchParams({ report: 'pay', period }).toString()}`;
}

export function profitabilityCsvUrl(jobId: string): string {
  return `/api/v1/reports/export.csv?${new URLSearchParams({ report: 'profitability', jobId }).toString()}`;
}

export function subsidyNextAction(milestone: SubsidyReportMilestone): string {
  if (milestone.status === 'DISBURSED') return 'Complete';
  if (milestone.status === 'APPROVED') return 'Await recorded disbursement';
  if (milestone.status === 'REJECTED') return 'Review rejection and decide whether to resubmit';
  if (milestone.pendingDocuments.length) return `Collect: ${milestone.pendingDocuments.join(', ')}`;
  if (milestone.responsibleOwner) return `Follow up with ${milestone.responsibleOwner.name}`;
  return 'Assign a responsible owner';
}
