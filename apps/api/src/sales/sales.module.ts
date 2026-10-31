import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';
import { EnquiryQueueController } from './enquiry-queue.controller';
import { EnquiryQueueService } from './enquiry-queue.service';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

@Module({
  imports: [AuthModule],
  controllers: [EnquiriesController, EnquiryQueueController, SurveysController],
  providers: [EnquiriesService, EnquiryQueueService, SurveysService, PublicFormRateLimitGuard],
  exports: [EnquiryQueueService, SurveysService],
})
export class SalesModule {}
