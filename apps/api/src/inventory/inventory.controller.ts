import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { allocateOrderRequestSchema, createDispatchRequestSchema, createStockCountRequestSchema, createStockTransferRequestSchema, receiveStockRequestSchema, recordScanRequestSchema, releaseOrderAllocationsRequestSchema, stockAsOfQuerySchema, stockDocumentCommandRequestSchema, stockLevelListQuerySchema, stockMovementListQuerySchema, stockValueQuerySchema, unitLookupQuerySchema,
  type AllocateOrderRequest, type CreateDispatchRequest, type CreateStockCountRequest, type CreateStockTransferRequest, type ReceiveStockRequest, type RecordScanRequest, type ReleaseOrderAllocationsRequest, type StockDocumentCommandRequest, type StockAsOfQuery, type StockLevelListQuery, type StockMovementListQuery, type StockValueQuery, type UnitLookupQuery } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { AllocationsService } from './allocations.service';
import { DispatchScansService } from './dispatch-scans.service';
import { StockDocumentsService } from './stock-documents.service';
import { StockIntegrityService } from './stock-integrity.service';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('WAREHOUSE', 'ADMIN')
export class InventoryController {
  constructor(private readonly receipts: StockReceiptsService, private readonly documents: StockDocumentsService, private readonly reads: StockReadService, private readonly allocations: AllocationsService, private readonly dispatchScans: DispatchScansService, private readonly integrity: StockIntegrityService) {}
  @Post('orders/:id/dispatches')
  createDispatch(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createDispatchRequestSchema)) body: CreateDispatchRequest) { return this.dispatchScans.create(request.user.id, key, id, body); }
  @Get('orders/:id/dispatch')
  orderDispatch(@Param('id', ParseUUIDPipe) id: string) { return this.dispatchScans.getForOrder(id); }
  @Get('dispatches/:id')
  dispatch(@Param('id', ParseUUIDPipe) id: string) { return this.dispatchScans.get(id); }
  @Post('dispatches/:id/scans')
  scan(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordScanRequestSchema)) body: RecordScanRequest) { return this.dispatchScans.record(request.user.id, key, id, body); }
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
  @Post('orders/:id/allocations/release')
  @HttpCode(200)
  release(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(releaseOrderAllocationsRequestSchema)) body: ReleaseOrderAllocationsRequest) {
    return this.allocations.releaseOrder(request.user.id, key, id, body);
  }
  @Get('stock/locations')
  locations() { return this.reads.listLocations(); }
  @Get('stock/movements')
  movements(@Query(new ZodValidationPipe(stockMovementListQuerySchema)) query: StockMovementListQuery) { return this.reads.listMovements(query); }
  @Get('stock/as-of')
  asOf(@Query(new ZodValidationPipe(stockAsOfQuerySchema)) query: StockAsOfQuery) { return this.reads.stockAsOf(query); }
  @Get('stock/value')
  value(@Query(new ZodValidationPipe(stockValueQuerySchema)) query: StockValueQuery) { return this.reads.stockValue(query); }
  @Get('stock/integrity')
  integrityReport() { return this.integrity.report(); }
  @Get('stock')
  levels(@Query(new ZodValidationPipe(stockLevelListQuerySchema)) query: StockLevelListQuery) { return this.reads.listLevels(query); }
  @Get('units')
  units(@Query(new ZodValidationPipe(unitLookupQuerySchema)) query: UnitLookupQuery) { return this.reads.lookupUnits(query); }
  @Get('units/:id')
  unit(@Param('id', ParseUUIDPipe) id: string) { return this.reads.getUnit(id); }
}
