import { Module } from '@nestjs/common';
import { CostWriterService } from './cost-writer.service';
import { InvoicingModule } from './invoicing.module';
import { InvoicesService } from './invoices.service';
import { ServiceInvoiceWriter } from './service-invoice-writer';

@Module({
  imports: [InvoicingModule],
  providers: [CostWriterService,
    { provide: ServiceInvoiceWriter, useExisting: InvoicesService }],
  exports: [CostWriterService, ServiceInvoiceWriter],
})
export class FinanceModule {}
