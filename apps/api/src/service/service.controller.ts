import { Body, CanActivate, Controller, ExecutionContext, HttpCode, Injectable, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { assessTicketInputSchema, confirmTicketInputSchema, createTicketInputSchema,
  resolveTicketInputSchema, type AssessTicketInput, type ConfirmTicketInput,
  type CreateTicketInput, type ResolveTicketInput } from '@sunshine/contracts';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { ServiceTicketAccess } from './service-access';
import { ServiceService } from './service.service';

@Injectable()
export class ServiceTicketGuard implements CanActivate {
  constructor(private readonly access: ServiceTicketAccess) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.assertCanManage(context.switchToHttp().getRequest());
    return true;
  }
}

@Controller('tickets')
@UseGuards(ServiceTicketGuard)
export class ServiceController {
  constructor(private readonly service: ServiceService) {}

  @Post()
  create(@Body(new ZodValidationPipe(createTicketInputSchema)) input: CreateTicketInput) {
    return this.service.createTicket(input);
  }

  @Post(':id/assess')
  @HttpCode(200)
  assess(@Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(assessTicketInputSchema)) input: AssessTicketInput) {
    return this.service.assessTicket(id, input);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  resolve(@Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(resolveTicketInputSchema)) input: ResolveTicketInput) {
    return this.service.resolveTicket(id, input);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(confirmTicketInputSchema)) input: ConfirmTicketInput) {
    return this.service.confirmClosure(id, input);
  }
}
