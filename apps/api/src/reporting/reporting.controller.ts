import { CanActivate, Controller, ExecutionContext, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { emptyReportQuerySchema, overviewQuerySchema, profitabilityQuerySchema } from '@sunshine/contracts';
import type { z } from 'zod';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { ReportingAccess } from './reporting-readers';
import { ReportingService } from './reporting.service';

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
  constructor(private readonly reporting: ReportingService) {}
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
