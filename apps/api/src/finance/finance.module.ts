import { Module } from '@nestjs/common';
import { CostWriterService } from './cost-writer.service';

@Module({
  providers: [CostWriterService],
  exports: [CostWriterService],
})
export class FinanceModule {}
