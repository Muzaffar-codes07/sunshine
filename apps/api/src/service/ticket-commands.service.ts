import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ticketAssessmentSnapshotSchema, type AssessTicketInput, type ConfirmTicketInput, type CreateTicketInput,
  type ResolveTicketInput, type StaffIdentity } from '@sunshine/contracts';
import type { Prisma, ServiceTicket } from '../generated/prisma/client';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { WarrantyEquipmentReader } from '../warranty/warranty-readers';
import { WarrantyService } from '../warranty/warranty.service';
import { repairBillingSnapshotSchema } from './repair-billing.types';
import { ticketResponse } from './service.service';

const blocked = (code: string, reason: string, nextAction = 'Reload the ticket and review its saved source facts before retrying.') => refusal({ code, reason, source: 'SERVICE', nextAction });

@Injectable()
export class TicketCommandsService {
  constructor(private readonly commands: IdempotencyService,
    private readonly equipment: WarrantyEquipmentReader, private readonly warranty: WarrantyService) {}

  async create(actor: StaffIdentity, key: string, input: CreateTicketInput) {
    const payload = { ...input, unitId: input.unitId.toLowerCase() };
    return this.run(actor, key, 'TICKET_CREATE', payload, async tx => {
      const before = await this.installed(tx, payload.unitId);
      await tx.$queryRaw`SELECT id FROM jobs WHERE id=${before.job!.id}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM units WHERE id=${payload.unitId}::uuid FOR NO KEY UPDATE`;
      const source = await this.installed(tx, payload.unitId);
      if (source.job!.id !== before.job!.id || source.customer!.id !== before.customer!.id) throw blocked('TICKET_SOURCE_CHANGED','Equipment ownership changed while opening this ticket.');
      // Multiple independent faults on a unit are allowed. Retrying one intent cannot create another ticket.
      return ticketResponse(await tx.serviceTicket.create({ data: { ticketNumber: `SVC-${randomUUID()}`, unitId: payload.unitId,
        jobId: source.job!.id, customerId: source.customer!.id, faultDescription: payload.faultDescription } }));
    });
  }

  async assess(actor: StaffIdentity, key: string, id: string, input: AssessTicketInput) {
    id = id.toLowerCase();
    return this.run(actor, key, 'TICKET_ASSESS', { id, ...input }, async tx => {
      const row = await this.lock(tx, id, input.version, ['OPEN','ASSESSED'], false);
      if (new Date(input.asOfDate).getTime() !== row.createdAt.getTime()) {
        throw new ApiError(400,'INVALID_INPUT','Coverage is assessed at the recorded complaint intake time.',{asOfDate:['Use the saved ticket createdAt; historical corrections require a separate audited import.']});
      }
      if (row.billingSnapshot || row.replacementSnapshot || await tx.ticketLine.count({where:{ticketId:id,phase:{not:'CANCELLED'}}}) ||
        await tx.invoice.count({where:{sourceType:'TICKET',sourceId:id}})) throw blocked('REASSESSMENT_LOCKED','Part requirements, work or financial effects already exist, so this decision cannot be replaced.');
      const result = await this.warranty.evaluateWarranty(row.unitId, row.createdAt, input.requestedScope, tx);
      const snapshot = ticketAssessmentSnapshotSchema.parse({...result, requestedScope:input.requestedScope,assessedAt:new Date().toISOString()});
      const saved = await tx.serviceTicket.update({where:{id},data:{status:'ASSESSED',assessmentSnapshot:snapshot,version:{increment:1}}});
      return ticketResponse(saved);
    });
  }

  async resolve(actor: StaffIdentity, key: string, id: string, input: ResolveTicketInput) {
    id=id.toLowerCase();
    return this.run(actor,key,'TICKET_RESOLVE',{id,...input},async tx=>{
      const row=await this.lock(tx,id,input.version,['ASSESSED','IN_PROGRESS']);
      if(!ticketAssessmentSnapshotSchema.safeParse(row.assessmentSnapshot).success) throw blocked('ASSESSMENT_REQUIRED','Record a valid coverage assessment first.');
      if(row.billingSnapshot){
        const billing=repairBillingSnapshotSchema.safeParse(row.billingSnapshot);
        if(!billing.success || billing.data.result.ticketId!==id || input.noWorkReason) throw blocked('REPAIR_BILLING_REQUIRED','Finalized work billing does not match this resolution.');
      } else {
        if(!input.noWorkReason || row.replacementSnapshot || await tx.ticketLine.count({where:{ticketId:id,phase:{not:'CANCELLED'}}}) ||
          await tx.invoice.count({where:{sourceType:'TICKET',sourceId:id}})) {
          throw blocked('REPAIR_BILLING_REQUIRED','Finalize actual repair billing first, or explicitly record why no work was performed.','A no-work resolution is allowed only when no parts, labour, replacement or invoice effects exist.');
        }
      }
      return ticketResponse(await tx.serviceTicket.update({where:{id},data:{status:'AWAITING_CUSTOMER_CONFIRMATION',
        resolutionDetails:input.resolutionDetails,noWorkReason:input.noWorkReason??null,resolvedAt:new Date(),version:{increment:1}}}));
    });
  }

  async confirm(actor: StaffIdentity, key: string, id: string, input: ConfirmTicketInput) {
    id=id.toLowerCase();
    return this.run(actor,key,'TICKET_CONFIRM',{id,...input},async tx=>{
      const row=await this.lock(tx,id,input.version,['AWAITING_CUSTOMER_CONFIRMATION']);
      const confirmedAt=new Date(input.confirmedAt),closedAt=new Date();
      if(!row.resolvedAt || confirmedAt<row.resolvedAt || confirmedAt>closedAt) throw new ApiError(400,'INVALID_INPUT','Confirmation must follow resolution and cannot be in the future.',{confirmedAt:['Record the actual confirmation time after resolution.']});
      return ticketResponse(await tx.serviceTicket.update({where:{id},data:{status:'CLOSED',confirmedBy:input.confirmerName,
        confirmationChannel:input.channel,confirmedAt,confirmationNotes:input.notes??null,closedAt,version:{increment:1}}}));
    });
  }

  private run<T>(actor: StaffIdentity,key: string,action: string,payload: unknown,work:(tx:Prisma.TransactionClient)=>Promise<T>) {
    return this.commands.run({actorId:actor.id,key,action,payload},async tx=>{
      await tx.$queryRaw`SELECT set_config('sunshine.actor_id',${actor.id},true)`;
      return work(tx);
    });
  }
  private async installed(tx: Prisma.TransactionClient,id:string) {
    const source=await this.equipment.findById(id,tx);
    if(!source) throw new ApiError(404,'UNIT_NOT_FOUND','Equipment not found');
    if(!source.job || !source.customer) throw blocked('INSTALLATION_REQUIRED','This unit has no verified delivered customer installation.');
    return source;
  }
  private async lock(tx: Prisma.TransactionClient,id:string,version:number,allowed:ServiceTicket['status'][], requireVerified=true) {
    const before=await tx.serviceTicket.findUnique({where:{id},select:{jobId:true,unitId:true}});
    if(!before) throw new ApiError(404,'TICKET_NOT_FOUND','Ticket not found');
    await tx.$queryRaw`SELECT id FROM jobs WHERE id=${before.jobId}::uuid FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM service_tickets WHERE id=${id}::uuid FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM units WHERE id=${before.unitId}::uuid FOR NO KEY UPDATE`;
    const row=await tx.serviceTicket.findUniqueOrThrow({where:{id}});
    if(row.version!==version) throw blocked('STALE_VERSION','This ticket changed. Reload the saved version.');
    if(!allowed.includes(row.status)) throw blocked('INVALID_TICKET_TRANSITION',`This action is unavailable from ${row.status}.`);
    if(requireVerified && !row.sourceVerifiedAt) throw blocked('TICKET_SOURCE_REVIEW_REQUIRED','This historical ticket needs verified intake/assessment evidence before further work.');
    const source=await this.installed(tx,row.unitId);
    if(source.job!.id!==row.jobId || source.customer!.id!==row.customerId) throw blocked('TICKET_LINK_CONFLICT','Saved equipment and customer ownership need review.');
    return row;
  }
}
