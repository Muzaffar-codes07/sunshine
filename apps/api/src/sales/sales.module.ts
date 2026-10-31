import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';
import { EnquiryQueueController } from './enquiry-queue.controller';
import { EnquiryQueueService } from './enquiry-queue.service';

@Module({
  imports: [AuthModule],
  controllers: [EnquiriesController, EnquiryQueueController],
  providers: [EnquiriesService, EnquiryQueueService, PublicFormRateLimitGuard],
  exports: [EnquiryQueueService],
})
export class SalesModule {}
