import { CanActivate, Controller, ExecutionContext, Get, Header, Injectable, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { emptyReportQuerySchema, overviewQuerySchema, profitabilityQuerySchema, reportExportQuerySchema } from '@sunshine/contracts';
import { Readable } from 'node:stream';
import type { z } from 'zod';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { ReportingAccess } from './reporting-readers';
import { ReportingService } from './reporting.service';
import { CsvExporterService } from './csv-exporter.service';

@Injectable()
export class ReportingGuard implements CanActivate {
  constructor(private readonly access: ReportingAccess) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.assertCanReadReports(context.switchToHttp().getRequest());
    return true;
  }
}

@Controller('reports')
@UseGuards(ReportingGuard)
export class ReportingController {
  constructor(private readonly reporting: ReportingService, private readonly csv: CsvExporterService) {}
  @Get('pay-summary')
  @Header('Cache-Control', 'no-store')
  async paySummary(@Query(new ZodValidationPipe(overviewQuerySchema)) query: z.infer<typeof overviewQuerySchema>) {
    return { data: await this.reporting.getTechnicianPaySummary(query.period) };
  }
  @Get(['export.csv', 'export-csv'])
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async exportCsv(@Query(new ZodValidationPipe(reportExportQuerySchema)) query: z.infer<typeof reportExportQuerySchema>) {
    // Complete validation/read before opening a stream so errors retain JSON envelopes.
    const csv = await this.csv.exportReportsCsv(query);
    return new StreamableFile(Readable.from([csv]), {
      type: 'text/csv; charset=utf-8', disposition: 'attachment; filename="sunshine-report.csv"',
    });
  }
  @Get('profitability')
  async profitability(@Query(new ZodValidationPipe(profitabilityQuerySchema)) query: z.infer<typeof profitabilityQuerySchema>) {
    return { data: await this.reporting.getJobProfitability(query.jobId) };
  }
  @Get('overview')
  async overview(@Query(new ZodValidationPipe(overviewQuerySchema)) query: z.infer<typeof overviewQuerySchema>) {
    return { data: await this.reporting.getPeriodSummary(query.period) };
  }
  @Get('subsidies')
  async subsidies(@Query(new ZodValidationPipe(emptyReportQuerySchema)) _query: Record<string, never>) {
    return { data: await this.reporting.getSubsidyMilestones() };
  }
}
