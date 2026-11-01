import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assessTicketInputSchema, confirmTicketInputSchema, createTicketInputSchema,
  resolveTicketInputSchema, serviceTicketResponseSchema, ticketListQuerySchema, ticketListResponseSchema, ticketAssessmentSnapshotSchema,
  warrantyEquipmentSchema, type AssessTicketInput, type ConfirmTicketInput,
  type CreateTicketInput, type ResolveTicketInput, type ServiceTicketResponse,
  type TicketListQuery, type TicketListResponse } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { WarrantyEquipmentReader } from '../warranty/warranty-readers';
import { WarrantyService } from '../warranty/warranty.service';
import { TicketRepository, type TicketRow } from './service.repository';

@Injectable()
export class ServiceService {
  constructor(private readonly tickets: TicketRepository, private readonly warranty: WarrantyService,
    private readonly equipment: WarrantyEquipmentReader) {}

  async getTicket(id: string): Promise<ServiceTicketResponse> {
    const ticketId = new ZodValidationPipe(z.uuid()).transform(id).toLowerCase();
    const ticket = await this.tickets.findById(ticketId);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'No ticket was found');
    return this.response(ticket);
  }

  async listTickets(query: TicketListQuery): Promise<TicketListResponse> {
    const input = new ZodValidationPipe(ticketListQuerySchema).transform(query);
    if (input.unitId) input.unitId = input.unitId.toLowerCase();
    const { rows, total } = await this.tickets.list(input);
    return ticketListResponseSchema.parse({ data: {
      items: rows.map((row) => this.response(row).data),
      page: input.page, pageSize: input.pageSize, total,
    } });
  }

  async createTicket(input: CreateTicketInput): Promise<ServiceTicketResponse> {
    const data = new ZodValidationPipe(createTicketInputSchema).transform(input);
    data.unitId = data.unitId.toLowerCase();
    const installation = await this.installation(data.unitId);
    return this.response(await this.tickets.create({
      ticketNumber: `SVC-${randomUUID()}`, unitId: data.unitId,
      customerId: installation.customer!.id, jobId: installation.job!.id,
      faultDescription: data.faultDescription,
    }));
  }

  async assessTicket(ticketId: string, input: AssessTicketInput): Promise<ServiceTicketResponse> {
    const data = new ZodValidationPipe(assessTicketInputSchema).transform(input);
    const ticket = await this.current(ticketId, data.version, ['OPEN']);
    const assessedAt = new Date();
    const asOfDate = new Date(data.asOfDate);
    if (asOfDate > assessedAt) throw new ApiError(400, 'INVALID_INPUT', 'Assessment instant cannot be in the future', { asOfDate: ['Use an occurrence at or before now'] });
    const installation = await this.installation(ticket.unitId);
    if (installation.customer!.id !== ticket.customerId || installation.job!.id !== ticket.jobId) {
      throw new ApiError(409, 'TICKET_LINK_CONFLICT', 'Unit installation no longer matches the ticket');
    }
    const assessment = await this.warranty.evaluateWarranty(ticket.unitId, asOfDate, data.requestedScope);
    const parsed = ticketAssessmentSnapshotSchema.safeParse({ ...assessment,
      requestedScope: data.requestedScope, assessedAt: assessedAt.toISOString() });
    if (!parsed.success || parsed.data.unitId !== ticket.unitId) {
      throw new ApiError(503, 'INVALID_TICKET_ASSESSMENT', 'Warranty assessment needs review');
    }
    return this.response(await this.tickets.transition(ticket, {
      status: 'ASSESSED', assessmentSnapshot: parsed.data,
    }));
  }

  /** Resolution records work notes only; Task 3.1/3.2 own stock and billing effects. */
  async resolveTicket(ticketId: string, input: ResolveTicketInput): Promise<ServiceTicketResponse> {
    const data = new ZodValidationPipe(resolveTicketInputSchema).transform(input);
    const ticket = await this.current(ticketId, data.version, ['ASSESSED', 'IN_PROGRESS']);
    const assessment = ticketAssessmentSnapshotSchema.safeParse(ticket.assessmentSnapshot);
    if (!assessment.success || assessment.data.unitId !== ticket.unitId) {
      throw new ApiError(409, 'ASSESSMENT_REQUIRED', 'Ticket needs a saved warranty assessment');
    }
    return this.response(await this.tickets.transition(ticket, {
      status: 'AWAITING_CUSTOMER_CONFIRMATION', resolutionDetails: data.resolutionDetails, resolvedAt: new Date(),
    }));
  }

  async confirmClosure(ticketId: string, input: ConfirmTicketInput): Promise<ServiceTicketResponse> {
    // Validate even internal callers; no path can close a ticket on status alone.
    const data = new ZodValidationPipe(confirmTicketInputSchema).transform(input);
    const ticket = await this.current(ticketId, data.version, ['AWAITING_CUSTOMER_CONFIRMATION']);
    const closedAt = new Date();
    const confirmedAt = new Date(data.confirmedAt);
    if (!ticket.resolutionDetails?.trim() || !ticket.resolvedAt) {
      throw new ApiError(409, 'RESOLUTION_REQUIRED', 'Resolution must be recorded before customer confirmation');
    }
    if (confirmedAt < ticket.resolvedAt || confirmedAt > closedAt) {
      throw new ApiError(400, 'INVALID_INPUT', 'Confirmation must occur after resolution and at or before now', {
        confirmedAt: ['Record the actual confirmation instant after resolution'],
      });
    }
    return this.response(await this.tickets.transition(ticket, {
      status: 'CLOSED', confirmedBy: data.confirmerName, confirmationChannel: data.channel,
      confirmedAt, confirmationNotes: data.notes ?? null, closedAt,
    }));
  }

  private async current(id: string, version: number, allowed: TicketRow['status'][]): Promise<TicketRow> {
    const ticketId = new ZodValidationPipe(z.uuid()).transform(id).toLowerCase();
    const ticket = await this.tickets.findById(ticketId);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'No ticket was found');
    if (ticket.version !== version) throw new ApiError(409, 'STALE_VERSION', 'Ticket changed; reload before retrying');
    if (!allowed.includes(ticket.status)) throw new ApiError(409, 'INVALID_TICKET_TRANSITION', `Cannot perform this action from ${ticket.status}`);
    return ticket;
  }

  private async installation(unitId: string) {
    const record = await this.equipment.findById(unitId.toLowerCase());
    if (!record) throw new ApiError(404, 'UNIT_NOT_FOUND', 'No unit was found');
    const parsed = warrantyEquipmentSchema.safeParse(record);
    if (!parsed.success || parsed.data.unit.id !== unitId) throw new ApiError(503, 'INVALID_EQUIPMENT_RECORD', 'Unit installation needs review');
    if (!parsed.data.customer || !parsed.data.job) throw new ApiError(409, 'INSTALLATION_REQUIRED', 'Unit must be associated with a customer installation');
    return parsed.data;
  }

  private response(ticket: TicketRow): ServiceTicketResponse {
    return serviceTicketResponseSchema.parse({ data: {
      id: ticket.id, ticketNumber: ticket.ticketNumber, customerId: ticket.customerId,
      unitId: ticket.unitId, jobId: ticket.jobId, status: ticket.status, version: ticket.version,
      replacedUnitId: ticket.replacedUnitId ?? null, newUnitId: ticket.newUnitId ?? null,
      faultDescription: ticket.faultDescription, assessmentSnapshot: ticket.assessmentSnapshot,
      resolutionDetails: ticket.resolutionDetails, resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      confirmation: ticket.confirmedBy === null ? null : {
        confirmerName: ticket.confirmedBy, channel: ticket.confirmationChannel,
        confirmedAt: ticket.confirmedAt?.toISOString(), ...(ticket.confirmationNotes === null ? {} : { notes: ticket.confirmationNotes }),
      },
      closedAt: ticket.closedAt?.toISOString() ?? null,
      createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(),
    } });
  }
}
