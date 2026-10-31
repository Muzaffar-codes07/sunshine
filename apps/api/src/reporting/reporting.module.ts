import { Module } from '@nestjs/common';
import { ReportingController, ReportingGuard } from './reporting.controller';
import { ReportingAccess, ReportingSourceReader, UnavailableReportingAccess, UnavailableReportingSourceReader } from './reporting-readers';
import { PrismaReportingReader, ReportingReader } from './reporting.repository';
import { ReportingService } from './reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, ReportingGuard,
    { provide: ReportingReader, useClass: PrismaReportingReader },
    { provide: ReportingSourceReader, useClass: UnavailableReportingSourceReader },
    { provide: ReportingAccess, useClass: UnavailableReportingAccess },
  ],
  exports: [ReportingService],
})
export class ReportingModule {}
