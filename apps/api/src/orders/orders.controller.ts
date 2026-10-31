import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { confirmOrderSchema, recordPaymentSchema, type ConfirmOrder, type RecordPayment } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { InvoicesService } from '../finance/invoices.service';
import { IdempotencyKey, IdempotencyService } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { OrdersService } from './orders.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Orders and money. Sales confirms orders; only admin records receipts, because the PRD requires an explicit finance
 * permission and viewing an order must not authorize posting money. Warehouse reads only the fulfilment view.
 */
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly invoices: InvoicesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('orders')
  confirm(
    @Body(new ZodValidationPipe(confirmOrderSchema)) body: ConfirmOrder, @IdempotencyKey() key: string,
    @Req() request: AuthenticatedStaffRequest,
  ) {
    return this.orders.confirm(body, key, request.user);
  }

  @Get('orders/:id')
  get(@Param('id', uuid) id: string) {
    return this.orders.get(id);
  }

  @Get('orders/:id/fulfilment')
  @Roles('SALES', 'ADMIN', 'WAREHOUSE')
  fulfilment(@Param('id', uuid) id: string) {
    return this.orders.getFulfilment(id);
  }

  @Get('enquiries/:id/order')
  getForEnquiry(@Param('id', uuid) enquiryId: string) {
    return this.orders.getForEnquiry(enquiryId);
  }

  @Get('invoices/:id')
  invoice(@Param('id', uuid) id: string) {
    return this.invoices.get(id);
  }

  @Post('invoices/:id/payments')
  @Roles('ADMIN')
  recordPayment(
    @Param('id', uuid) id: string, @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPayment,
    @IdempotencyKey() key: string, @Req() request: AuthenticatedStaffRequest,
  ) {
    return this.idempotency.run(
      { actorId: request.user.id, key, action: 'PAYMENT_RECEIPT', payload: { invoiceId: id, ...body } },
      async (tx) => ({ data: await this.invoices.recordPayment(tx, id, body, request.user) }),
    );
  }
}
