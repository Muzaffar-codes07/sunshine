import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
<<<<<<< HEAD
import { FieldModule } from '../field/field.module';
=======
>>>>>>> origin/main
import { InvoicingModule } from '../finance/invoicing.module';
import { QuotesModule } from '../quotes/quotes.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

<<<<<<< HEAD
// FieldModule supplies ORDER_JOB_CREATOR (see order-job.port.ts), so confirmation creates the job.
@Module({
  imports: [AuthModule, QuotesModule, InvoicingModule, FieldModule],
=======
// D3 can supply ORDER_JOB_CREATOR (see order-job.port.ts) from its jobs module when available.
@Module({
  imports: [AuthModule, QuotesModule, InvoicingModule],
>>>>>>> origin/main
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
