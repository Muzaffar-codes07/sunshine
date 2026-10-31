import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListPattern } from '../../components/shared/patterns';
import { describeProblem, humanize } from '../sales/queries';
import { useJobs } from './queries';

function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  if (total <= pageSize) return null;
  return <p><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button> Page {page} of {Math.ceil(total / pageSize)} <button type="button" disabled={page * pageSize >= total} onClick={() => onChange(page + 1)}>Next</button></p>;
}

export function FulfilmentOrders() {
  const [page, setPage] = useState(1);
  const jobs = useJobs(page);
  return <section>
    <ListPattern title="Orders to fulfil" empty="No confirmed orders yet."
      columns={[{ id: 'order', label: 'Order' }, { id: 'status', label: 'Job status' }]}
      loading={jobs.isPending} error={jobs.error ? describeProblem(jobs.error).message : undefined} onRetry={() => void jobs.refetch()}
      rows={(jobs.data?.data.items ?? []).map((job) => ({ id: job.id, cells: {
        order: <Link to={`/workspace/warehouse/orders/${job.orderId}`}>{job.orderDisplayNumber}</Link>, status: humanize(job.status),
      } }))} />
    {jobs.data && <Pager page={page} total={jobs.data.data.total} pageSize={jobs.data.data.pageSize} onChange={setPage} />}
  </section>;
}

