import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { profitabilityQuerySchema, reportPeriodSchema, type ReportPeriod } from '@sunshine/contracts';
import { DetailPattern, FormPattern, ListPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { readOverview, readPay, readProfitability, readSubsidies } from './report-api';
import { formatMoney, overviewCsvUrl, payCsvUrl, profitabilityCsvUrl, subsidyNextAction } from './report-model';
import { describeD4Error as errorMessage } from '../service/d4-http';
import { OperationsReport } from './OperationsReport';
import { CsvDownload } from './CsvDownload';
import { InstallationLabourPanel } from './InstallationLabourPanel';

export function ReportsWorkspacePage() {
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [jobId, setJobId] = useState('');
  const [selectedJob, setSelectedJob] = useState('');
  const [jobError, setJobError] = useState('');
  const overview = useQuery({
    queryKey: ['reports', 'overview', period],
    queryFn: ({ signal }) => readOverview(period, signal),
    retry: false,
  });
  const pay = useQuery({
    queryKey: ['reports', 'pay', period],
    queryFn: ({ signal }) => readPay(period, signal),
    retry: false,
  });
  const subsidies = useQuery({
    queryKey: ['reports', 'subsidies'],
    queryFn: ({ signal }) => readSubsidies(signal),
    retry: false,
  });
  const profitability = useQuery({
    queryKey: ['reports', 'profitability', selectedJob],
    queryFn: ({ signal }) => readProfitability(selectedJob, signal),
    enabled: selectedJob !== '',
    retry: false,
  });

  function submitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = profitabilityQuerySchema.safeParse({ jobId: jobId.trim() });
    if (!parsed.success) { setJobError(parsed.error.issues[0]?.message ?? 'Enter a valid job ID.'); return; }
    setJobError('');
    if (selectedJob === parsed.data.jobId) void profitability.refetch();
    else setSelectedJob(parsed.data.jobId);
  }

  const subsidyRows = subsidies.data?.groups.flatMap((group) => group.milestones.map((milestone) => ({
    id: milestone.id,
    cells: {
      stage: milestone.stage,
      status: milestone.status,
      job: milestone.jobId,
      amount: formatMoney(milestone.amount),
      owner: milestone.responsibleOwner?.name ?? 'Unassigned',
      next: subsidyNextAction(milestone),
    },
  }))) ?? [];

  return <section aria-labelledby="reports-workspace-title">
    <h1 id="reports-workspace-title">Reports</h1>
    <p>Posted invoices, cash and costs. Periods use Asia/Kolkata calendar boundaries. Installation pay uses approved frozen rates; service pay is still pending integration. Job contribution stays provisional when costs are incomplete.</p>
    <OperationsReport />
    <InstallationLabourPanel />

    <Field label="Report period" hint="Today, week and month use IST calendar boundaries.">
      {(control) => <select {...control} value={period} onChange={(event) => {
        const parsed = reportPeriodSchema.safeParse(event.target.value);
        if (parsed.success) setPeriod(parsed.data);
      }}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>}
    </Field>

    {overview.isPending && <p role="status">Loading period summary…</p>}
    {overview.isError && <div role="alert"><p>{errorMessage(overview.error)}</p><button onClick={() => void overview.refetch()}>Retry summary</button></div>}
    {overview.isSuccess && overview.data && <DetailPattern title={`Period summary — ${overview.data.startDate} to ${overview.data.endDate} (end excluded)`} entries={[
      { id: 'asOf', label: 'Recorded as of', value: overview.data.asOf },
      { id: 'invoiced', label: 'Invoiced', value: formatMoney(overview.data.invoicedRevenue) },
      { id: 'cash', label: 'Cash received', value: formatMoney(overview.data.cashReceived) },
      { id: 'cost', label: 'Actual cost', value: formatMoney(overview.data.actualCost) },
      { id: 'material', label: 'Material', value: formatMoney(overview.data.costBreakdown.material) },
      { id: 'installation', label: 'Installation labour', value: formatMoney(overview.data.costBreakdown.installationLabour) },
      { id: 'service', label: 'Service labour', value: formatMoney(overview.data.costBreakdown.serviceLabour) },
      { id: 'repairs', label: 'Repair parts', value: formatMoney(overview.data.costBreakdown.repairParts) },
    ]}><CsvDownload key={period} url={overviewCsvUrl(period)} label="Download this period as CSV" />
      <p className="field-hint">CSV uses the selected filters and current posted records at download time.</p>
    </DetailPattern>}

    <FormPattern title="Job profitability" submitLabel="Load job" onSubmit={submitJob} error={jobError}>
      <Field label="Job ID" error={jobError || undefined}>{(control) => <input {...control} name="jobId" value={jobId} onChange={(event) => setJobId(event.target.value)} required />}</Field>
    </FormPattern>
    {profitability.isFetching && <p role="status">Loading job profitability…</p>}
    {profitability.isError && <div role="alert"><p>{errorMessage(profitability.error)}</p><button onClick={() => void profitability.refetch()}>Retry job</button></div>}
    {profitability.isSuccess && profitability.data && <DetailPattern title={`Job ${profitability.data.jobId}`} entries={[
      { id: 'asOf', label: 'Recorded as of', value: profitability.data.asOf },
      { id: 'status', label: 'Result status', value: profitability.data.isProvisional ? 'Provisional — unfinished' : 'Completed' },
      { id: 'revenue', label: 'Invoiced revenue', value: formatMoney(profitability.data.invoicedRevenue) },
      { id: 'cash', label: 'Cash received', value: formatMoney(profitability.data.cashReceived) },
      { id: 'outstanding', label: 'Outstanding', value: formatMoney(profitability.data.outstanding) },
      { id: 'cost', label: 'Actual cost', value: formatMoney(profitability.data.actualCost) },
      { id: 'contribution', label: 'Contribution', value: formatMoney(profitability.data.contribution) },
      { id: 'margin', label: 'Margin', value: profitability.data.marginPercentage === null ? 'Not available' : `${profitability.data.marginPercentage}%` },
    ]}>
      {profitability.data.unfinishedSteps.length > 0 && <p>Unfinished: {profitability.data.unfinishedSteps.join(', ')}</p>}
      <CsvDownload key={profitability.data.jobId} url={profitabilityCsvUrl(profitability.data.jobId)} label="Download this job as CSV" />
    </DetailPattern>}

    <ListPattern title="Technician pay" loading={pay.isPending} error={pay.isError ? errorMessage(pay.error) : undefined}
      onRetry={() => void pay.refetch()} empty="No approved technician time in this period."
      columns={[{ id: 'name', label: 'Technician' }, { id: 'hours', label: 'Approved hours' }, { id: 'pay', label: 'Pay' }]}
      rows={(pay.data?.technicians ?? []).map((row) => ({ id: row.technicianId, cells: { name: row.technicianName, hours: row.totalHours, pay: formatMoney(row.totalPay) } }))} />
    {pay.isSuccess && pay.data && <><p role="status">{pay.data.scope === 'INSTALLATION_ONLY' ? 'Installation pay only — service time and unapproved installation work are excluded.' : 'All approved technician time.'}</p>
      <p>Total: {pay.data.totalHours} hours · {formatMoney(pay.data.totalPay)}. Recorded as of {pay.data.asOf}.</p>
      <CsvDownload key={period} url={payCsvUrl(period)} label="Download pay CSV" /></>}

    <ListPattern title="Subsidy milestones" loading={subsidies.isPending} error={subsidies.isError ? errorMessage(subsidies.error) : undefined}
      onRetry={() => void subsidies.refetch()} empty="No subsidy milestones recorded."
      columns={[{ id: 'stage', label: 'Stage' }, { id: 'status', label: 'Status' }, { id: 'job', label: 'Job' }, { id: 'amount', label: 'Recorded amount' }, { id: 'owner', label: 'Owner' }, { id: 'next', label: 'Next action' }]}
      rows={subsidyRows} />
  </section>;
}
