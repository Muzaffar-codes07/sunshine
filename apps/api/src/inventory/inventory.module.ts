import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { InventoryController } from './inventory.controller';
import { StockDocumentsService } from './stock-documents.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockReadService } from './stock-read.service';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [PlatformModule, AuthModule],
  controllers: [InventoryController],
  providers: [StockLedgerService, StockReceiptsService, StockDocumentsService, StockReadService],
  exports: [StockLedgerService, StockReadService],
})
export class InventoryModule {}
