import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvoicingModule } from '../finance/invoicing.module';
import { FilesModule } from '../files/files.module';
import { ORDER_JOB_CREATOR } from '../orders/order-job.port';
import { PlatformModule } from '../platform/platform.module';
import { InstallationService } from './installation.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PlatformModule, AuthModule, FilesModule, InvoicingModule],
  controllers: [JobsController],
  providers: [JobsService, InstallationService, { provide: ORDER_JOB_CREATOR, useExisting: JobsService }],
  exports: [JobsService, ORDER_JOB_CREATOR],
})
export class FieldModule {}
