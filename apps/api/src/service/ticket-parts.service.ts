import { Injectable } from '@nestjs/common';
import { ticketAssessmentSnapshotSchema,ticketPartCommandResponseSchema,ticketPartsResponseSchema,
  type CreateTicketPart,type CancelTicketPart,type TicketPartsQuery,type StaffIdentity } from '@sunshine/contracts';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { IdempotencyService } from '../platform/idempotency';
import { ApiError,refusal } from '../platform/api-error';
import { normalizeWarrantyScope } from '../warranty/warranty-scope';

const productView={id:true,name:true,trackingMode:true} as const;
type Part=Prisma.TicketLineGetPayload<{include:{product:{select:typeof productView}}}>;
const blocked=(code:string,reason:string)=>refusal({code,reason,source:'SERVICE',nextAction:'Reload the ticket and its part requirements. Resolve the saved source or state before retrying.'});
const view=(row:Part)=>({id:row.id,ticketId:row.ticketId,version:row.version,phase:row.phase,
  product:row.product,description:row.description,quantity:row.quantity.toFixed(3),scope:row.scope,
  unitPrice:row.unitPrice?.toFixed(2)??null,unitCost:row.unitCost?.toFixed(6)??null,totalCost:row.totalCost?.toFixed(2)??null,
  billableToCustomer:row.billableToCustomer,createdAt:row.createdAt.toISOString(),createdById:row.createdById,
  cancelledAt:row.cancelledAt?.toISOString()??null,cancelledById:row.cancelledById,cancellationReason:row.cancellationReason});

/** Planned requirements are not consumed stock or costs. Only actual issuance may freeze those facts. */
@Injectable()
export class TicketPartsService {
  constructor(private readonly prisma:PrismaService,private readonly commands:IdempotencyService) {}

  async list(id:string,query:TicketPartsQuery){
    id=id.toLowerCase();
    return this.prisma.$transaction(async tx=>{
      if(!await tx.serviceTicket.findUnique({where:{id},select:{id:true}})) throw new ApiError(404,'TICKET_NOT_FOUND','Ticket not found');
      const where={ticketId:id,lineType:'PART' as const};
      const [rows,total]=await Promise.all([tx.ticketLine.findMany({where,include:{product:{select:productView}},
        orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(query.page-1)*query.pageSize,take:query.pageSize}),tx.ticketLine.count({where})]);
      return ticketPartsResponseSchema.parse({data:{items:rows.map(view),total,page:query.page,pageSize:query.pageSize}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }

  async create(actor:StaffIdentity,key:string,id:string,input:CreateTicketPart){
    id=id.toLowerCase();const payload={id,...input,productId:input.productId.toLowerCase(),quantity:new Prisma.Decimal(input.quantity).toFixed(3)};
    return this.commands.run({actorId:actor.id,key,action:'TICKET_PART_CREATE',payload},async tx=>{
      await this.actor(tx,actor.id);const ticket=await this.lock(tx,id,input.version);
      const assessment=ticketAssessmentSnapshotSchema.safeParse(ticket.assessmentSnapshot);
      if(!assessment.success) throw blocked('ASSESSMENT_REQUIRED','A verified coverage decision is required.');
      if(normalizeWarrantyScope(input.scope)!==normalizeWarrantyScope(assessment.data.requestedScope)) throw blocked('REPAIR_SCOPE_CONFLICT','Assess the actual required work scope before adding its parts.');
      await tx.$queryRaw`SELECT id FROM products WHERE id=${payload.productId}::uuid FOR NO KEY UPDATE`;
      const product=await tx.product.findUnique({where:{id:payload.productId}});
      if(!product || !product.active || product.kind!=='HARDWARE' || product.trackingMode==='NONE') throw blocked('PART_PRODUCT_INVALID','Select an active stocked hardware product.');
      if(product.trackingMode==='SERIALIZED' && !new Prisma.Decimal(payload.quantity).equals(1)) throw new ApiError(400,'INVALID_INPUT','One serialized unit is required per part line.',{quantity:['Add separate lines for separate physical units.']});
      const part=await tx.ticketLine.create({data:{ticketId:id,lineType:'PART',phase:'PLANNED',productId:product.id,
        description:`${product.name}: ${input.reason}`,quantity:payload.quantity,unitCost:null,totalCost:null,
        unitPrice:product.unitSalePrice,scope:input.scope,billableToCustomer:!assessment.data.isCovered},include:{product:{select:productView}}});
      const saved=await tx.serviceTicket.update({where:{id},data:{version:{increment:1}}});
      return ticketPartCommandResponseSchema.parse({data:{ticketVersion:saved.version,part:view(part)}});
    });
  }

  async cancel(actor:StaffIdentity,key:string,id:string,lineId:string,input:CancelTicketPart){
    id=id.toLowerCase();lineId=lineId.toLowerCase();
    return this.commands.run({actorId:actor.id,key,action:'TICKET_PART_CANCEL',payload:{id,lineId,...input}},async tx=>{
      await this.actor(tx,actor.id);await this.lock(tx,id,input.version);
      await tx.$queryRaw`SELECT id FROM ticket_lines WHERE id=${lineId}::uuid FOR NO KEY UPDATE`;
      const part=await tx.ticketLine.findUnique({where:{id:lineId}});
      if(!part || part.ticketId!==id || part.lineType!=='PART') throw new ApiError(404,'PART_NOT_FOUND','Part requirement not found');
      if(part.version!==input.lineVersion) throw blocked('STALE_VERSION','This part requirement changed.');
      if(part.phase!=='PLANNED') throw blocked('PART_NOT_CANCELLABLE','Only an unused planned requirement can be cancelled. Issued stock needs a return.');
      const savedPart=await tx.ticketLine.update({where:{id:lineId},data:{phase:'CANCELLED',version:{increment:1},cancelledAt:new Date(),cancelledById:actor.id,cancellationReason:input.reason},include:{product:{select:productView}}});
      const saved=await tx.serviceTicket.update({where:{id},data:{version:{increment:1}}});
      return ticketPartCommandResponseSchema.parse({data:{ticketVersion:saved.version,part:view(savedPart)}});
    });
  }

  private actor(tx:Prisma.TransactionClient,id:string){return tx.$queryRaw`SELECT set_config('sunshine.actor_id',${id},true)`;}
  private async lock(tx:Prisma.TransactionClient,id:string,version:number){
    const before=await tx.serviceTicket.findUnique({where:{id},select:{jobId:true}});
    if(!before) throw new ApiError(404,'TICKET_NOT_FOUND','Ticket not found');
    await tx.$queryRaw`SELECT id FROM jobs WHERE id=${before.jobId}::uuid FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM service_tickets WHERE id=${id}::uuid FOR NO KEY UPDATE`;
    const ticket=await tx.serviceTicket.findUniqueOrThrow({where:{id}});
    if(ticket.version!==version) throw blocked('STALE_VERSION','This ticket changed.');
    if(!ticket.sourceVerifiedAt || !['ASSESSED','IN_PROGRESS'].includes(ticket.status) || ticket.billingSnapshot || ticket.replacementSnapshot) throw blocked('PART_REQUIREMENT_LOCKED','Part requirements need a verified, assessed ticket before finalized billing or replacement.');
    return ticket;
  }
}
