import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { jobListResponseSchema, jobResponseSchema, stockIntegrityResponseSchema, surveyListResponseSchema, ticketListResponseSchema, type JobView, type StaffRole } from '@sunshine/contracts';
import { apiGet } from '../../lib/api';
import { readOverview } from '../reports/report-api';
import type { DocumentRow } from './dashboard-model';

const assignedResponseSchema = z.object({ data: z.array(jobResponseSchema.shape.data) });
const jobReaders: readonly StaffRole[] = ['ADMIN', 'SALES', 'WAREHOUSE', 'TECHNICIAN'];

/** The list endpoint caps at the 100 newest jobs, so `total` tells the page when it isn't seeing everything. */
export const useDashboardJobs = (role: StaffRole) => useQuery({
  queryKey: ['dashboard', 'jobs', role],
  enabled: jobReaders.includes(role),
  queryFn: async ({ signal }): Promise<{ items: JobView[]; total: number }> => {
    if (role === 'TECHNICIAN') {
      const items = (await apiGet('/jobs/assigned', assignedResponseSchema, signal)).data;
      return { items, total: items.length };
    }
    const { data } = await apiGet('/jobs?pageSize=100', jobListResponseSchema, signal);
    return { items: data.items, total: data.total };
  },
});

export const useMonthOverview = (role: StaffRole) => useQuery({
  queryKey: ['dashboard', 'overview'], enabled: role === 'ADMIN',
  queryFn: ({ signal }) => readOverview('month', signal),
});

export const useStockCheck = (role: StaffRole) => useQuery({
  queryKey: ['dashboard', 'stock-integrity'], enabled: role === 'ADMIN' || role === 'WAREHOUSE', staleTime: 60_000,
  queryFn: async ({ signal }) => (await apiGet('/stock/integrity', stockIntegrityResponseSchema, signal)).data,
});

export const useTechnicianCount = (role: StaffRole) => useQuery({
  queryKey: ['dashboard', 'technicians'], enabled: role === 'ADMIN' || role === 'SALES', staleTime: 60_000,
  queryFn: async ({ signal }) => (await apiGet('/staff?role=TECHNICIAN', z.object({ data: z.object({ items: z.array(z.object({ id: z.uuid() }).loose()) }) }), signal)).data.items.length,
});

export const useOpenTickets = (role: StaffRole) => useQuery({
  queryKey: ['dashboard', 'tickets'], enabled: role === 'ADMIN' || role === 'SUPPORT',
  queryFn: async ({ signal }) => (await apiGet('/tickets?page=1&pageSize=50', ticketListResponseSchema, signal)).data,
});

export const useSurveyApprovals = (role: StaffRole) => useQuery({
  queryKey: ['dashboard', 'survey-approvals'], enabled: role === 'ADMIN' || role === 'SALES',
  queryFn: async ({ signal }): Promise<DocumentRow[]> => (await apiGet('/surveys/awaiting-approval', surveyListResponseSchema, signal)).data.items
    .map((survey) => ({ id: `survey-${survey.id}`, name: 'Survey approval', detail: survey.site.contactName, status: 'Waiting', href: `/workspace/sales/enquiries/${survey.enquiryId}` })),
});
