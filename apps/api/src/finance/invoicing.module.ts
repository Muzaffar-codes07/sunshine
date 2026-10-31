import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

/** D2's invoice and receipt writer. D4 imports it for chargeable repair invoices; D3 reads payment facts. */
@Module({ providers: [InvoicesService], exports: [InvoicesService] })
export class InvoicingModule {}
