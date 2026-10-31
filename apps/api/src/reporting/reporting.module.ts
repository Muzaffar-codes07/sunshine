import { AuthModule } from '../auth/auth.module';
import { PersistedReportingSource, StaffReportingAccess } from './persisted-reporting-source';
import { Module } from '@nestjs/common';
import { ReportingController, ReportingGuard } from './reporting.controller';
import { ReportingAccess, ReportingSourceReader } from './reporting-readers';
import { PrismaReportingReader, ReportingReader } from './reporting.repository';
import { ReportingService } from './reporting.service';
import { CsvExporterService } from './csv-exporter.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingGuard, CsvExporterService,
    { provide: ReportingReader, useClass: PrismaReportingReader },
    { provide: ReportingSourceReader, useClass: PersistedReportingSource },
    { provide: ReportingAccess, useClass: StaffReportingAccess },
  ],
  exports: [ReportingService],
})
export class ReportingModule {}
