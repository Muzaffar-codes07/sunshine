import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ORDER_JOB_CREATOR } from '../orders/order-job.port';
import { PlatformModule } from '../platform/platform.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PlatformModule, AuthModule],
  controllers: [JobsController],
  providers: [JobsService, { provide: ORDER_JOB_CREATOR, useExisting: JobsService }],
  exports: [JobsService, ORDER_JOB_CREATOR],
})
export class FieldModule {}
