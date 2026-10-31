import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FieldModule } from '../field/field.module';
import { InvoicingModule } from '../finance/invoicing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// FieldModule supplies ORDER_JOB_CREATOR (see order-job.port.ts), so confirmation creates the job.
@Module({
  imports: [AuthModule, QuotesModule, InvoicingModule, FieldModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
