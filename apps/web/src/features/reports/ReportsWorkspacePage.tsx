import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { profitabilityQuerySchema, reportPeriodSchema, type ReportPeriod } from '@sunshine/contracts';
import { DetailPattern, FormPattern, ListPattern, MoneyStrip, StatusPill } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { readOverview, readPay, readProfitability, readSubsidies } from './report-api';
import { overviewCsvUrl, payCsvUrl, profitabilityCsvUrl, subsidyNextAction } from './report-model';
import { describeD4Error as errorMessage } from '../service/d4-http';
import { OperationsReport } from './OperationsReport';
import { CsvDownload } from './CsvDownload';
import { formatWhen, humanize } from '../sales/queries';
import { useDashboardJobs } from '../dashboard/dashboard-data';
import { formatDay, formatInr } from '../dashboard/dashboard-model';
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
    if (!parsed.success) { setJobError('Choose a job.'); return; }
    setJobError('');
    if (selectedJob === parsed.data.jobId) void profitability.refetch();
    else setSelectedJob(parsed.data.jobId);
  }

  const jobList = useDashboardJobs('ADMIN').data, jobs = jobList?.items ?? [];
  const jobName = (id: string) => { const job = jobs.find((item) => item.id === id); return job ? `${job.orderDisplayNumber} · ${job.contactName}` : 'Job'; };

  const subsidyRows = subsidies.data?.groups.flatMap((group) => group.milestones.map((milestone) => ({
    id: milestone.id,
    cells: {
      stage: humanize(milestone.stage),
      status: <StatusPill status={milestone.status} />,
      job: jobName(milestone.jobId),
      amount: formatInr(milestone.amount),
      owner: milestone.responsibleOwner?.name ?? 'Unassigned',
      next: subsidyNextAction(milestone),
    },
  }))) ?? [];

  const breakdown = overview.data ? [
    { id: 'material', label: 'Material', amount: overview.data.costBreakdown.material, color: 'var(--navy)' },
    { id: 'installation', label: 'Installation labour', amount: overview.data.costBreakdown.installationLabour, color: 'var(--gold)' },
    { id: 'service', label: 'Service labour', amount: overview.data.costBreakdown.serviceLabour, color: '#8b93a7' },
    { id: 'repairs', label: 'Repair parts', amount: overview.data.costBreakdown.repairParts, color: 'var(--beige)' },
  ] : [];
  const costTotal = breakdown.reduce((sum, part) => sum + Number(part.amount), 0);

  return <section aria-labelledby="reports-workspace-title">
    <div className="page-head">
      <div><h1 id="reports-workspace-title">Finance &amp; reports</h1><p className="page-sub page-sub--wide">Posted invoices, cash and costs, by IST calendar day. Installation pay uses approved frozen rates; service pay isn't connected yet. Job figures stay provisional until costs are complete.</p></div>
      <Field label="Report period">
        {(control) => <select {...control} value={period} onChange={(event) => {
          const parsed = reportPeriodSchema.safeParse(event.target.value);
          if (parsed.success) setPeriod(parsed.data);
        }}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>}
      </Field>
    </div>

    {overview.isPending && <p role="status">Loading period summary…</p>}
    {overview.isError && <div role="alert"><p>{errorMessage(overview.error)}</p><button onClick={() => void overview.refetch()}>Retry summary</button></div>}
    {overview.isSuccess && overview.data && <section className="pattern-card">
      <h2>Period summary: {formatDay(overview.data.startDate)} to {formatDay(overview.data.endDate)} (end excluded)</h2>
      <MoneyStrip items={[
        { id: 'invoiced', label: 'Invoiced', value: formatInr(overview.data.invoicedRevenue) },
        { id: 'cash', label: 'Cash received', value: formatInr(overview.data.cashReceived) },
        { id: 'cost', label: 'Actual cost', value: formatInr(overview.data.actualCost), strong: true },
      ]} />
      {costTotal > 0 && <div className="cost-bar" aria-hidden="true">{breakdown.filter((part) => Number(part.amount) > 0).map((part) => <i key={part.id} style={{ width: `${Number(part.amount) / costTotal * 100}%`, background: part.color }} />)}</div>}
      <ul className="cost-legend">{breakdown.map((part) => <li key={part.id}><i style={{ background: part.color }} /><span>{part.label}</span><strong>{formatInr(part.amount)}</strong></li>)}</ul>
      <div className="action-row"><CsvDownload key={period} url={overviewCsvUrl(period)} label="Download this period as CSV" /><span className="field-hint">Recorded as of {formatWhen(overview.data.asOf)}. The CSV uses current posted records.</span></div>
    </section>}

    <div className="detail-layout">
      <div className="detail-main">
        <OperationsReport />
        <InstallationLabourPanel />
        <section className="pattern-card titled-list">
          <h2>Subsidy milestones</h2>
          <ListPattern title="Subsidy milestones" loading={subsidies.isPending} error={subsidies.isError ? errorMessage(subsidies.error) : undefined}
            onRetry={() => void subsidies.refetch()} empty="No subsidy milestones recorded."
            columns={[{ id: 'stage', label: 'Stage' }, { id: 'status', label: 'Status' }, { id: 'job', label: 'Job' }, { id: 'amount', label: 'Recorded amount' }, { id: 'owner', label: 'Owner' }, { id: 'next', label: 'Next action' }]}
            rows={subsidyRows} />
        </section>
      </div>
      <aside className="detail-side">
        <section className="pattern-card">
          <FormPattern title="Job profitability" submitLabel="Load job" onSubmit={submitJob} error={jobError}>
            <Field label="Job" error={jobError || undefined} hint={jobList && jobList.total > jobs.length ? `Showing the newest ${jobs.length} of ${jobList.total} jobs.` : undefined}>{(control) => <select {...control} name="jobId" value={jobId} onChange={(event) => setJobId(event.target.value)} required>
              <option value="">Choose a job</option>
              {jobs.map((job) => <option key={job.id} value={job.id}>{job.orderDisplayNumber} · {job.contactName}</option>)}
            </select>}</Field>
          </FormPattern>
          {profitability.isFetching && <p role="status">Loading job profitability…</p>}
          {profitability.isError && <div role="alert"><p>{errorMessage(profitability.error)}</p><button onClick={() => void profitability.refetch()}>Retry job</button></div>}
          {profitability.isSuccess && profitability.data && <DetailPattern title={jobName(profitability.data.jobId)} entries={[
            { id: 'status', label: 'Result status', value: profitability.data.isProvisional ? 'Provisional — unfinished' : 'Completed' },
            { id: 'revenue', label: 'Invoiced revenue', value: formatInr(profitability.data.invoicedRevenue) },
            { id: 'cash', label: 'Cash received', value: formatInr(profitability.data.cashReceived) },
            { id: 'outstanding', label: 'Outstanding', value: formatInr(profitability.data.outstanding) },
            { id: 'cost', label: 'Actual cost', value: formatInr(profitability.data.actualCost) },
            { id: 'contribution', label: 'Contribution', value: formatInr(profitability.data.contribution) },
            { id: 'margin', label: 'Margin', value: profitability.data.marginPercentage === null ? 'Not available' : `${profitability.data.marginPercentage}%` },
            { id: 'asOf', label: 'Recorded as of', value: formatWhen(profitability.data.asOf) },
          ]}>
            {profitability.data.unfinishedSteps.length > 0 && <p className="panel-note">Unfinished: {profitability.data.unfinishedSteps.join(', ')}</p>}
            <CsvDownload key={profitability.data.jobId} url={profitabilityCsvUrl(profitability.data.jobId)} label="Download this job as CSV" />
          </DetailPattern>}
        </section>
        <section className="pattern-card titled-list">
          <h2>Technician pay</h2>
          <ListPattern title="Technician pay" loading={pay.isPending} error={pay.isError ? errorMessage(pay.error) : undefined}
            onRetry={() => void pay.refetch()} empty="No approved technician time in this period."
            columns={[{ id: 'name', label: 'Technician' }, { id: 'hours', label: 'Approved hours' }, { id: 'pay', label: 'Pay' }]}
            rows={(pay.data?.technicians ?? []).map((row) => ({ id: row.technicianId, cells: { name: row.technicianName, hours: row.totalHours, pay: formatInr(row.totalPay) } }))} />
          {pay.isSuccess && pay.data && <><p role="status" className="panel-note">{pay.data.scope === 'INSTALLATION_ONLY' ? 'Installation pay only — service time and unapproved installation work are excluded.' : 'All approved technician time.'}</p>
            <p className="panel-note">Total: {Number(pay.data.totalHours)} hours · {formatInr(pay.data.totalPay)}. Recorded as of {formatWhen(pay.data.asOf)}.</p>
            <CsvDownload key={period} url={payCsvUrl(period)} label="Download pay CSV" /></>}
        </section>
      </aside>
    </div>
  </section>;
}
