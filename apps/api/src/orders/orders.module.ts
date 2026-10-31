import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicingModule } from '../finance/invoicing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// D3 can supply ORDER_JOB_CREATOR (see order-job.port.ts) from its jobs module when available.
@Module({
  imports: [AuthModule, QuotesModule, InvoicingModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
