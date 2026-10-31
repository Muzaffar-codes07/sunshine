import { Module } from '@nestjs/common';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';
import { EnquiryQueueService } from './enquiry-queue.service';

// The staff queue controller is added once the auth guards (X2) exist, so no staff route ships unguarded.
@Module({
  controllers: [EnquiriesController],
  providers: [EnquiriesService, EnquiryQueueService, PublicFormRateLimitGuard],
  exports: [EnquiryQueueService],
})
export class SalesModule {}
