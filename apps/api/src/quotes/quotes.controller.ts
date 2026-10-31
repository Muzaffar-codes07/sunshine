import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { createQuoteSchema, reviseQuoteSchema, sendQuoteSchema, acceptQuoteSchema, rejectQuoteSchema,
  type CreateQuote, type ReviseQuote, type SendQuote, type AcceptQuote, type RejectQuote } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { QuotesService } from './quotes.service';

const uuid = new ParseUUIDPipe({ version: '4' });
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}
  @Post('enquiries/:id/quotes')
  create(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(createQuoteSchema)) command: CreateQuote, @Req() req: AuthenticatedStaffRequest) {
    return this.quotes.create(id, command, req.user);
  }
  @Get('enquiries/:id/quotes')
  list(@Param('id', uuid) id: string) { return this.quotes.listForEnquiry(id); }
  @Get('quotes/:id')
  get(@Param('id', uuid) id: string) { return this.quotes.get(id); }
  @Post('quotes/:id/revise')
  revise(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(reviseQuoteSchema)) command: ReviseQuote, @Req() req: AuthenticatedStaffRequest) {
    return this.quotes.revise(id, command, req.user);
  }
  @Post('quotes/:id/send')
  send(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(sendQuoteSchema)) command: SendQuote, @Req() req: AuthenticatedStaffRequest) {
    return this.quotes.send(id, command, req.user);
  }
  @Post('quotes/:id/accept')
  accept(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(acceptQuoteSchema)) command: AcceptQuote, @Req() req: AuthenticatedStaffRequest) {
    return this.quotes.accept(id, command, req.user);
  }
  @Post('quotes/:id/reject')
  reject(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(rejectQuoteSchema)) command: RejectQuote, @Req() req: AuthenticatedStaffRequest) {
    return this.quotes.reject(id, command, req.user);
  }
}
