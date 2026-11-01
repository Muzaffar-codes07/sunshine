import {Body,Controller,Get,Header,Param,ParseUUIDPipe,Post,Query,Req,UseGuards} from '@nestjs/common';
import {createTicketPartSchema,cancelTicketPartSchema,ticketPartsQuerySchema,type CreateTicketPart,type CancelTicketPart,type TicketPartsQuery} from '@sunshine/contracts';
import {AuthGuard} from '../auth/auth.guard';
import {RolesGuard} from '../auth/roles.guard';
import {Roles} from '../auth/roles.decorator';
import type {AuthenticatedStaffRequest} from '../auth/auth.types';
import {IdempotencyKey} from '../platform/idempotency';
import {ZodValidationPipe} from '../platform/zod-validation.pipe';
import {TicketPartsService} from './ticket-parts.service';

// Part costs/prices and requirement approval are an ADMIN operation; ordinary ticket support remains separate.
@Controller('tickets') @UseGuards(AuthGuard,RolesGuard) @Roles('ADMIN')
export class TicketPartsController {
  constructor(private readonly parts:TicketPartsService) {}
  @Get(':id/parts') @Header('Cache-Control','no-store')
  list(@Param('id',new ParseUUIDPipe()) id:string,@Query(new ZodValidationPipe(ticketPartsQuerySchema)) query:TicketPartsQuery){return this.parts.list(id,query);}
  @Post(':id/parts') @Header('Cache-Control','no-store')
  create(@Req() request:AuthenticatedStaffRequest,@IdempotencyKey() key:string,@Param('id',new ParseUUIDPipe()) id:string,
    @Body(new ZodValidationPipe(createTicketPartSchema)) input:CreateTicketPart){return this.parts.create(request.user,key,id,input);}
  @Post(':id/parts/:lineId/cancel') @Header('Cache-Control','no-store')
  cancel(@Req() request:AuthenticatedStaffRequest,@IdempotencyKey() key:string,@Param('id',new ParseUUIDPipe()) id:string,@Param('lineId',new ParseUUIDPipe()) lineId:string,
    @Body(new ZodValidationPipe(cancelTicketPartSchema)) input:CancelTicketPart){return this.parts.cancel(request.user,key,id,lineId,input);}
}
