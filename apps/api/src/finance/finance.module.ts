import { Module } from '@nestjs/common';
import { CostWriterService } from './cost-writer.service';
import { ServiceInvoiceWriter, UnavailableServiceInvoiceWriter } from './service-invoice-writer';

@Module({
  providers: [CostWriterService,
    { provide: ServiceInvoiceWriter, useClass: UnavailableServiceInvoiceWriter }],
  exports: [CostWriterService, ServiceInvoiceWriter],
})
export class FinanceModule {}
