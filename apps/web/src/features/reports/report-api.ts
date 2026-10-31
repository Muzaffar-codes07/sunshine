import { z } from 'zod';
import {
  jobProfitabilityReportSchema,
  periodSummarySchema,
  subsidyReportSchema,
  technicianPayReportSchema,
  type JobProfitabilityReport,
  type PeriodSummary,
  type ReportPeriod,
  type SubsidyReport,
  type TechnicianPayReport,
} from '@sunshine/contracts';
import { apiGet } from '../../lib/api';
import { d4Fetch, D4RequestError } from '../service/d4-http';

const overviewResponseSchema = z.object({ data: periodSummarySchema });
const profitabilityResponseSchema = z.object({ data: jobProfitabilityReportSchema });
const payResponseSchema = z.object({ data: technicianPayReportSchema });
const subsidiesResponseSchema = z.object({ data: subsidyReportSchema });

export async function readOverview(period: ReportPeriod, signal?: AbortSignal): Promise<PeriodSummary> {
  return (await apiGet(`/reports/overview?${new URLSearchParams({ period }).toString()}`, overviewResponseSchema, signal)).data;
}

export async function readProfitability(jobId: string, signal?: AbortSignal): Promise<JobProfitabilityReport> {
  return (await apiGet(`/reports/profitability?${new URLSearchParams({ jobId }).toString()}`, profitabilityResponseSchema, signal)).data;
}

export async function readPay(period: ReportPeriod, signal?: AbortSignal): Promise<TechnicianPayReport> {
  return (await apiGet(`/reports/pay-summary?${new URLSearchParams({ period }).toString()}`, payResponseSchema, signal)).data;
}

export async function readSubsidies(signal?: AbortSignal): Promise<SubsidyReport> {
  return (await apiGet('/reports/subsidies', subsidiesResponseSchema, signal)).data;
}

export async function readCsv(url: string, signal?: AbortSignal): Promise<Blob> {
  const prefix = '/api/v1';
  if (!url.startsWith(`${prefix}/reports/export.csv?`)) throw new Error('Invalid report export URL');
  const response = await d4Fetch(url.slice(prefix.length), { signal, headers: { Accept: 'text/csv' } });
  if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'text/csv') {
    throw new D4RequestError('The server did not return a CSV file.', response.status, 'CONTRACT_MISMATCH');
  }
  return response.blob();
}
