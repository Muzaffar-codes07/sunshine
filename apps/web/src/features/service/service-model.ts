import type { ServiceTicket, TicketAssessmentSnapshot } from '@sunshine/contracts';

export type TicketAction = 'ASSESS' | 'RESOLVE' | 'CONFIRM' | 'DONE';

export function nextTicketAction(status: ServiceTicket['status']): TicketAction {
  if (status === 'OPEN') return 'ASSESS';
  if (status === 'ASSESSED' || status === 'IN_PROGRESS') return 'RESOLVE';
  if (status === 'AWAITING_CUSTOMER_CONFIRMATION') return 'CONFIRM';
  return 'DONE';
}

export function coverageLabel(assessment: TicketAssessmentSnapshot | null): string {
  if (!assessment) return 'Not assessed';
  return assessment.isCovered ? 'Covered — customer charge ₹0.00' : 'Not covered — charge pending assessment';
}

export function warrantyPeriod(assessment: Pick<TicketAssessmentSnapshot, 'startDate' | 'expiryDate'> | null, formatDate = (day: string) => day): string {
  if (!assessment?.startDate || !assessment.expiryDate) return 'No saved warranty period';
  return `${formatDate(assessment.startDate)} to ${formatDate(assessment.expiryDate)} (expiry excluded)`;
}

/** Saved numbers end in a full UUID; its first block is enough to tell tickets apart on screen. */
export function shortTicketNumber(ticketNumber: string): string {
  const block = /^SVC-([0-9a-f]{8})-[0-9a-f-]+$/i.exec(ticketNumber)?.[1];
  return block ? `SVC-${block.toUpperCase()}` : ticketNumber;
}
