import { Body, Controller, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { assessTicketInputSchema, confirmTicketInputSchema, createTicketInputSchema, resolveTicketInputSchema,
  type AssessTicketInput,type ConfirmTicketInput,type CreateTicketInput,type ResolveTicketInput } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { TicketCommandsService } from './ticket-commands.service';

@Controller('tickets')
@UseGuards(AuthGuard,RolesGuard)
@Roles('ADMIN','SUPPORT')
export class TicketCommandsController {
  constructor(private readonly tickets:TicketCommandsService) {}
  @Post() @Header('Cache-Control','no-store')
  create(@Req() request:AuthenticatedStaffRequest,@IdempotencyKey() key:string,
    @Body(new ZodValidationPipe(createTicketInputSchema)) input:CreateTicketInput){return this.tickets.create(request.user,key,input);}
  @Post(':id/assess') @HttpCode(200) @Header('Cache-Control','no-store')
  assess(@Req() request:AuthenticatedStaffRequest,@IdempotencyKey() key:string,@Param('id',new ParseUUIDPipe()) id:string,
    @Body(new ZodValidationPipe(assessTicketInputSchema)) input:AssessTicketInput){return this.tickets.assess(request.user,key,id,input);}
  @Post(':id/resolve') @HttpCode(200) @Header('Cache-Control','no-store')
  resolve(@Req() request:AuthenticatedStaffRequest,@IdempotencyKey() key:string,@Param('id',new ParseUUIDPipe()) id:string,
    @Body(new ZodValidationPipe(resolveTicketInputSchema)) input:ResolveTicketInput){return this.tickets.resolve(request.user,key,id,input);}
  @Post(':id/confirm') @HttpCode(200) @Header('Cache-Control','no-store')
  confirm(@Req() request:AuthenticatedStaffRequest,@IdempotencyKey() key:string,@Param('id',new ParseUUIDPipe()) id:string,
    @Body(new ZodValidationPipe(confirmTicketInputSchema)) input:ConfirmTicketInput){return this.tickets.confirm(request.user,key,id,input);}
}
