import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicingModule } from '../finance/invoicing.module';
import { PlatformModule } from '../platform/platform.module';
import { FinanceModule } from '../finance/finance.module';
import { AllocationsService } from './allocations.service';
import { DispatchPostingService } from './dispatch-posting.service';
import { DispatchScansService } from './dispatch-scans.service';
import { InventoryController } from './inventory.controller';
import { StockDocumentsService } from './stock-documents.service';
import { StockIntegrityService } from './stock-integrity.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [PlatformModule, AuthModule, InvoicingModule, FinanceModule],
  controllers: [InventoryController],
  providers: [AllocationsService, DispatchPostingService, DispatchScansService, StockLedgerService, StockReceiptsService, StockDocumentsService, StockReadService, StockIntegrityService],
  exports: [StockLedgerService, StockReadService],
})
export class InventoryModule {}
