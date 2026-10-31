import {
  serviceTicketResponseSchema,
  warrantyLookupResponseSchema,
  type AssessTicketInput,
  type ConfirmTicketInput,
  type CreateTicketInput,
  type ResolveTicketInput,
  type TicketListQuery,
  type TicketListResponse,
  type ServiceTicketResponse,
  ticketListResponseSchema,
  type WarrantyLookupQuery,
  type WarrantyLookupResponse,
} from '@sunshine/contracts';
import { apiGet, apiPost } from '../../lib/api';

function postTicket(path: string, body: unknown, idempotencyKey: string) {
  return apiPost(path, serviceTicketResponseSchema, body, { idempotencyKey });
}

export function lookupWarranty(query: WarrantyLookupQuery, signal?: AbortSignal): Promise<WarrantyLookupResponse> {
  const search = new URLSearchParams({ serial: query.serial });
  if (query.manufacturerId) search.set('manufacturerId', query.manufacturerId);
  if (query.productId) search.set('productId', query.productId);
  return apiGet(`/warranties/lookup?${search.toString()}`, warrantyLookupResponseSchema, signal);
}

export function getTicket(id: string, signal?: AbortSignal): Promise<ServiceTicketResponse> {
  return apiGet(`/tickets/${encodeURIComponent(id)}`, serviceTicketResponseSchema, signal);
}

export function listTickets(query: TicketListQuery, signal?: AbortSignal): Promise<TicketListResponse> {
  const search = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.unitId) search.set('unitId', query.unitId);
  if (query.status) search.set('status', query.status);
  return apiGet(`/tickets?${search.toString()}`, ticketListResponseSchema, signal);
}

export function createTicket(input: CreateTicketInput, idempotencyKey: string): Promise<ServiceTicketResponse> {
  return postTicket('/tickets', input, idempotencyKey);
}

export function assessTicket(id: string, input: AssessTicketInput, idempotencyKey: string): Promise<ServiceTicketResponse> {
  return postTicket(`/tickets/${encodeURIComponent(id)}/assess`, input, idempotencyKey);
}

export function resolveTicket(id: string, input: ResolveTicketInput, idempotencyKey: string): Promise<ServiceTicketResponse> {
  return postTicket(`/tickets/${encodeURIComponent(id)}/resolve`, input, idempotencyKey);
}

export function confirmTicket(id: string, input: ConfirmTicketInput, idempotencyKey: string): Promise<ServiceTicketResponse> {
  return postTicket(`/tickets/${encodeURIComponent(id)}/confirm`, input, idempotencyKey);
}
