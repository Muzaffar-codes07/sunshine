import { Module } from '@nestjs/common';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';

@Module({
  controllers: [EnquiriesController],
  providers: [EnquiriesService, PublicFormRateLimitGuard],
})
export class SalesModule {}
