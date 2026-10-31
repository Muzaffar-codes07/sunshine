import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ticketListQuerySchema, type TicketListQuery } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { ServiceService } from './service.service';

/** Read-only saved ticket access. POST commands remain behind ServiceTicketGuard. */
@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPPORT')
export class ServiceReadController {
  constructor(private readonly service: ServiceService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query(new ZodValidationPipe(ticketListQuerySchema)) query: TicketListQuery) {
    return this.service.listTickets(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.service.getTicket(id);
  }
}
