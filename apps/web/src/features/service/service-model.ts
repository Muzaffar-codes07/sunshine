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

export function warrantyPeriod(assessment: Pick<TicketAssessmentSnapshot, 'startDate' | 'expiryDate'> | null): string {
  if (!assessment?.startDate || !assessment.expiryDate) return 'No saved warranty period';
  return `${assessment.startDate} to ${assessment.expiryDate} (expiry excluded)`;
}
