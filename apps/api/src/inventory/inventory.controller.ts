import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { allocateOrderRequestSchema, createStockCountRequestSchema, createStockTransferRequestSchema, receiveStockRequestSchema, stockDocumentCommandRequestSchema, stockLevelListQuerySchema, unitLookupQuerySchema,
  type AllocateOrderRequest, type CreateStockCountRequest, type CreateStockTransferRequest, type ReceiveStockRequest, type StockDocumentCommandRequest, type StockLevelListQuery, type UnitLookupQuery } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { AllocationsService } from './allocations.service';
import { StockDocumentsService } from './stock-documents.service';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('WAREHOUSE', 'ADMIN')
export class InventoryController {
  constructor(private readonly receipts: StockReceiptsService, private readonly documents: StockDocumentsService, private readonly reads: StockReadService, private readonly allocations: AllocationsService) {}
  @Post('stock/receipts')
  receive(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Body(new ZodValidationPipe(receiveStockRequestSchema)) body: ReceiveStockRequest) {
    return this.receipts.receive(request.user.id, key, body);
  }
  @Get('stock/receipts/:id')
  receipt(@Param('id', ParseUUIDPipe) id: string) { return this.receipts.get(id); }
  @Post('stock/transfers')
  transfer(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Body(new ZodValidationPipe(createStockTransferRequestSchema)) body: CreateStockTransferRequest) {
    return this.documents.createTransfer(request.user.id, key, body);
  }
  @Post('stock/counts')
  count(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Body(new ZodValidationPipe(createStockCountRequestSchema)) body: CreateStockCountRequest) {
    return this.documents.createCount(request.user.id, key, body);
  }
  @Get('stock/documents/:id')
  document(@Param('id', ParseUUIDPipe) id: string) { return this.documents.get(id); }
  @Post('stock/documents/:id/validate')
  @HttpCode(200)
  validate(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(stockDocumentCommandRequestSchema)) body: StockDocumentCommandRequest) {
    return this.documents.validate(request.user.id, key, id, body);
  }
  @Post('stock/documents/:id/cancel')
  @HttpCode(200)
  cancel(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(stockDocumentCommandRequestSchema)) body: StockDocumentCommandRequest) {
    return this.documents.cancel(request.user.id, key, id, body);
  }
  @Post('orders/:id/allocations')
  allocate(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(allocateOrderRequestSchema)) body: AllocateOrderRequest) {
    return this.allocations.allocateOrder(request.user.id, key, id, body);
  }
  @Get('orders/:id/allocations')
  orderAllocations(@Param('id', ParseUUIDPipe) id: string) { return this.allocations.listForOrder(id); }
  @Get('stock/locations')
  locations() { return this.reads.listLocations(); }
  @Get('stock')
  levels(@Query(new ZodValidationPipe(stockLevelListQuerySchema)) query: StockLevelListQuery) { return this.reads.listLevels(query); }
  @Get('units')
  units(@Query(new ZodValidationPipe(unitLookupQuerySchema)) query: UnitLookupQuery) { return this.reads.lookupUnits(query); }
}
