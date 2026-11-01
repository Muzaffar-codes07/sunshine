import { Injectable } from '@nestjs/common';
import { ticketAssessmentSnapshotSchema,ticketHistoryResponseSchema,type TicketHistoryQuery } from '@sunshine/contracts';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
const object=(value:unknown):Record<string,unknown>=>value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};

@Injectable()
export class TicketHistoryService {
  constructor(private readonly prisma:PrismaService) {}
  async get(id:string,query:TicketHistoryQuery){
    id=id.toLowerCase();
    return this.prisma.$transaction(async tx=>{
      if(!await tx.serviceTicket.findUnique({where:{id},select:{id:true}})) throw new ApiError(404,'TICKET_NOT_FOUND','Ticket not found');
      const [rows,total]=await Promise.all([tx.serviceTicketEvent.findMany({where:{ticketId:id},include:{actor:{select:{id:true,displayName:true}}},
        orderBy:[{occurredAt:'desc'},{id:'asc'}],skip:(query.page-1)*query.pageSize,take:query.pageSize}),tx.serviceTicketEvent.count({where:{ticketId:id}})]);
      return ticketHistoryResponseSchema.parse({data:{total,page:query.page,pageSize:query.pageSize,items:rows.map(row=>{
        const before=object(row.beforeSnapshot),after=object(row.afterSnapshot);
        const previous=ticketAssessmentSnapshotSchema.safeParse(before.assessmentSnapshot),current=ticketAssessmentSnapshotSchema.safeParse(after.assessmentSnapshot);
        if(after.assessmentSnapshot!=null && !current.success) throw new ApiError(503,'TICKET_HISTORY_INVALID','Saved service history needs review');
        return {id:row.id,occurredAt:row.occurredAt.toISOString(),actor:{id:row.actor.id,name:row.actor.displayName},fromStatus:before.status??null,status:after.status,
          previousAssessment:previous.success?previous.data:null,assessment:current.success?current.data:null,
          previousAssessmentUnverified:before.assessmentSnapshot!=null && !previous.success};
      })}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
}
