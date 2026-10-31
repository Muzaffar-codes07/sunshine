import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListPattern } from '../../components/shared/patterns';
import { useStaffSession } from '../auth/session';
import { describeProblem, humanize } from '../sales/queries';
import { ReceiveStock } from './ReceiveStockForm';
import { useJobs, useStockLevels } from './queries';

function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  if (total <= pageSize) return null;
  return <p><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button> Page {page} of {Math.ceil(total / pageSize)} <button type="button" disabled={page * pageSize >= total} onClick={() => onChange(page + 1)}>Next</button></p>;
}

function Orders() {
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

function Levels() {
  const [page, setPage] = useState(1);
  const levels = useStockLevels(page);
  return <section>
    <ListPattern title="Stock levels" empty="No stock received yet."
      columns={[{ id: 'product', label: 'Product' }, { id: 'location', label: 'Location' }, { id: 'onHand', label: 'On hand' }, { id: 'reserved', label: 'Reserved' }, { id: 'free', label: 'Free' }]}
      loading={levels.isPending} error={levels.error ? describeProblem(levels.error).message : undefined} onRetry={() => void levels.refetch()}
      rows={(levels.data?.data.items ?? []).map((level) => ({ id: `${level.productId}:${level.locationId}`, cells: {
        product: `${level.sku} · ${level.productName}`, location: level.locationCode, onHand: level.onHand, reserved: level.reserved,
        free: level.locationKind === 'QUARANTINE' ? 'Quarantined' : level.free,
      } }))} />
    {levels.data && <Pager page={page} total={levels.data.data.total} pageSize={levels.data.data.pageSize} onChange={setPage} />}
  </section>;
}

export function WarehousePage() {
  const session = useStaffSession();
  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  if (!session.data || !['WAREHOUSE', 'ADMIN'].includes(session.data.role)) return <p role="alert">Your role cannot use the warehouse workspace.</p>;
  return <>
    <h1>Warehouse</h1>
    <ReceiveStock />
    <Orders />
    <Levels />
  </>;
}
