import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicingModule } from '../finance/invoicing.module';
import { PlatformModule } from '../platform/platform.module';
import { AllocationsService } from './allocations.service';
import { InventoryController } from './inventory.controller';
import { StockDocumentsService } from './stock-documents.service';
import { StockIntegrityService } from './stock-integrity.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [PlatformModule, AuthModule, InvoicingModule],
  controllers: [InventoryController],
  providers: [AllocationsService, StockLedgerService, StockReceiptsService, StockDocumentsService, StockReadService, StockIntegrityService],
  exports: [StockLedgerService, StockReadService],
})
export class InventoryModule {}
