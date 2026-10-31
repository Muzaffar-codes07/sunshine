import { Injectable } from '@nestjs/common';
import { jobProfitabilityReportSchema, reportExportQuerySchema,
  type JobProfitabilityReport, type ReportExportQuery } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { ReportingService } from './reporting.service';

// Only explicitly typed numeric cells bypass text protection. Never infer a
// number from user text: even a technician named '-1500.00' stays text.
export type CsvCell = string | { kind: 'number'; value: string };
const numeric = (value: string): CsvCell => ({ kind: 'number', value });
function cell(value: CsvCell): string {
  let text: string;
  if (typeof value === 'string') {
    text = /^[\s\u0000-\u001f]*[=+\-@]|^[\s\u0000-\u001f]*[\t\r\n]/u.test(value) ? `'${value}` : value;
  } else {
    if (!value || value.kind !== 'number' || typeof value.value !== 'string'
      || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value.value)) {
      throw new ApiError(503, 'INVALID_REPORT_RECORD', 'Invalid numeric CSV cell');
    }
    text = value.value;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

@Injectable()
export class CsvExporterService {
  constructor(private readonly reporting: ReportingService) {}

  /** RFC 4180: fixed column counts, escaped quotes, CRLF records, final CRLF. */
  exportRows(headers: string[], rows: CsvCell[][]): string {
    if (rows.some((row) => row.length !== headers.length)) {
      throw new ApiError(503, 'INVALID_REPORT_RECORD', 'CSV column count mismatch');
    }
    return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  exportProfitabilityToCsv(data: readonly JobProfitabilityReport[]): string {
    const rows = data.map((input) => {
      const row = jobProfitabilityReportSchema.parse(input);
      return [row.jobId, row.asOf, String(row.isCompleted), String(row.isProvisional), row.unfinishedSteps.join('; '),
        numeric(row.invoicedRevenue), numeric(row.cashReceived), numeric(row.outstanding),
        numeric(row.costBreakdown.material), numeric(row.costBreakdown.installationLabour),
        numeric(row.costBreakdown.serviceLabour), numeric(row.costBreakdown.repairParts), numeric(row.actualCost),
        numeric(row.contribution), numeric(row.completedProfit), row.marginPercentage === null ? '' : numeric(row.marginPercentage)];
    });
    return this.exportRows(['jobId', 'asOf', 'isCompleted', 'isProvisional', 'unfinishedSteps',
      'invoicedRevenue', 'cashReceived', 'outstanding', 'materialCost', 'installationLabourCost',
      'serviceLabourCost', 'repairPartsCost', 'actualCost', 'contribution', 'completedProfit', 'marginPercentage'], rows);
  }

  async exportReportsCsv(filter: ReportExportQuery): Promise<string> {
    const parsed = reportExportQuerySchema.safeParse(filter);
    if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Invalid CSV report filter');
    const query = parsed.data;
    if (query.report === 'profitability') {
      return this.exportProfitabilityToCsv([await this.reporting.getJobProfitability(query.jobId)]);
    }
    if (query.report === 'pay') {
      const report = await this.reporting.getTechnicianPaySummary(query.period);
      return this.exportRows(['period', 'startUtc', 'endUtc', 'asOf', 'technicianId', 'technicianName', 'totalHours', 'totalPay'],
        report.technicians.map((row) => [report.period, report.startUtc, report.endUtc, report.asOf,
          row.technicianId, row.technicianName, numeric(row.totalHours), numeric(row.totalPay)]));
    }
    const report = await this.reporting.getPeriodSummary(query.period);
    return this.exportRows(['period', 'startUtc', 'endUtc', 'asOf', 'invoicedRevenue', 'cashReceived',
      'materialCost', 'installationLabourCost', 'serviceLabourCost', 'repairPartsCost', 'actualCost'],
    [[report.period, report.startUtc, report.endUtc, report.asOf, numeric(report.invoicedRevenue), numeric(report.cashReceived),
      numeric(report.costBreakdown.material), numeric(report.costBreakdown.installationLabour),
      numeric(report.costBreakdown.serviceLabour), numeric(report.costBreakdown.repairParts), numeric(report.actualCost)]]);
  }
}
