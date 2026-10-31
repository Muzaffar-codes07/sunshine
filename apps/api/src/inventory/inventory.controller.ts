import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { receiveStockRequestSchema, stockLevelListQuerySchema, unitLookupQuerySchema,
  type ReceiveStockRequest, type StockLevelListQuery, type UnitLookupQuery } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('WAREHOUSE', 'ADMIN')
export class InventoryController {
  constructor(private readonly receipts: StockReceiptsService, private readonly reads: StockReadService) {}
  @Post('stock/receipts')
  receive(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Body(new ZodValidationPipe(receiveStockRequestSchema)) body: ReceiveStockRequest) {
    return this.receipts.receive(request.user.id, key, body);
  }
  @Get('stock/locations')
  locations() { return this.reads.listLocations(); }
  @Get('stock')
  levels(@Query(new ZodValidationPipe(stockLevelListQuerySchema)) query: StockLevelListQuery) { return this.reads.listLevels(query); }
  @Get('units')
  units(@Query(new ZodValidationPipe(unitLookupQuerySchema)) query: UnitLookupQuery) { return this.reads.lookupUnits(query); }
}
