import { Module } from '@nestjs/common';
import { ReportingController, ReportingGuard } from './reporting.controller';
import { ReportingAccess, ReportingSourceReader, UnavailableReportingAccess, UnavailableReportingSourceReader } from './reporting-readers';
import { PrismaReportingReader, ReportingReader } from './reporting.repository';
import { ReportingService } from './reporting.service';
import { CsvExporterService } from './csv-exporter.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, ReportingGuard, CsvExporterService,
    { provide: ReportingReader, useClass: PrismaReportingReader },
    { provide: ReportingSourceReader, useClass: UnavailableReportingSourceReader },
    { provide: ReportingAccess, useClass: UnavailableReportingAccess },
  ],
  exports: [ReportingService],
})
export class ReportingModule {}
