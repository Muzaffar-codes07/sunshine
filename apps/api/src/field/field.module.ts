import { Module } from '@nestjs/common';
import { ORDER_JOB_CREATOR } from '../orders/order-job.port';
import { JobsService } from './jobs.service';

@Module({
  providers: [JobsService, { provide: ORDER_JOB_CREATOR, useExisting: JobsService }],
  exports: [JobsService, ORDER_JOB_CREATOR],
})
export class FieldModule {}
