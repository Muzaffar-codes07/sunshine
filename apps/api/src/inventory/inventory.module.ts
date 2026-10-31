import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicingModule } from '../finance/invoicing.module';
import { PlatformModule } from '../platform/platform.module';
import { AllocationsService } from './allocations.service';
import { DispatchScansService } from './dispatch-scans.service';
import { InventoryController } from './inventory.controller';
import { StockDocumentsService } from './stock-documents.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [PlatformModule, AuthModule, InvoicingModule],
  controllers: [InventoryController],
  providers: [AllocationsService, DispatchScansService, StockLedgerService, StockReceiptsService, StockDocumentsService, StockReadService],
  exports: [StockLedgerService, StockReadService],
})
export class InventoryModule {}
