import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { packageListResponseSchema, productListResponseSchema, type ProductView } from '@sunshine/contracts';
import { ListPattern, StatusPill } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { apiGet } from '../../lib/api';
import { useStaffSession } from '../auth/session';
import { formatInr } from '../dashboard/dashboard-model';
import { describeProblem, humanize } from '../sales/queries';

const TRACKING: Record<ProductView['trackingMode'], string> = { SERIALIZED: 'Serial numbers', BULK: 'Bulk quantity', NONE: 'Not stocked' };
const UNITS: Record<ProductView['unitOfMeasure'], string> = { PCS: 'piece', SET: 'set', M: 'metre', JOB: 'job' };

/** The real catalogue: what can be sold and installed, and how each item is tracked. */
export function EquipmentPage() {
  const role = useStaffSession().data?.role;
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [term, setTerm] = useState('');
  const [view, setView] = useState<'products' | 'packages'>('products');
  const products = useQuery({ queryKey: ['equipment', 'products', page], retry: false, queryFn: ({ signal }) => apiGet(`/products?pageSize=100&page=${page}`, productListResponseSchema, signal) });
  const seesPackages = role === 'ADMIN' || role === 'SALES';
  const packages = useQuery({ queryKey: ['equipment', 'packages'], retry: false, enabled: seesPackages, queryFn: ({ signal }) => apiGet('/packages?pageSize=100', packageListResponseSchema, signal) });
  const data = products.data?.data, items = useMemo(() => data?.items ?? [], [data]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const search = term.trim().toLowerCase();
  const shown = items.filter((item) => (!category || item.category === category)
    && (!search || `${item.name} ${item.sku} ${item.manufacturer?.name ?? ''}`.toLowerCase().includes(search)));

  return <section aria-labelledby="equipment-title">
    <div className="page-head">
      <div><h1 id="equipment-title">Equipment</h1><p className="page-sub">Everything in the catalogue, with its price and how it's tracked.</p></div>
      {(role === 'ADMIN' || role === 'WAREHOUSE') && <Link className="button-link" to="/workspace/warehouse">See stock levels</Link>}
    </div>
    {seesPackages && <div className="segmented equipment-view" role="group" aria-label="Catalogue view">
      <button type="button" aria-pressed={view === 'products'} onClick={() => setView('products')}>Products</button>
      <button type="button" aria-pressed={view === 'packages'} onClick={() => setView('packages')}>System packages</button>
    </div>}
    {view === 'products' && <section className="pattern-card titled-list">
      <h2>Products{data ? ` (${data.total})` : ''}</h2>
      <div className="filters-row">
        <Field label="Search equipment">{(control) => <input {...control} type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Name, SKU or manufacturer" />}</Field>
        <Field label="Category">{(control) => <select {...control} value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>{categories.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>}</Field>
      </div>
      <ListPattern title="Products" loading={products.isPending} error={products.error ? describeProblem(products.error).message : undefined}
        onRetry={() => void products.refetch()} empty={items.length ? 'No equipment matches this search.' : 'The catalogue is empty.'}
        columns={[{ id: 'name', label: 'Product' }, { id: 'category', label: 'Category' }, { id: 'maker', label: 'Manufacturer' }, { id: 'tracking', label: 'Tracked by' }, { id: 'price', label: 'Price' }, { id: 'status', label: 'Status' }]}
        rows={shown.map((item) => ({ id: item.id, cells: {
          name: <>{item.name}<small className="cell-sub">{item.sku}</small></>, category: humanize(item.category),
          maker: item.manufacturer?.name ?? 'Own service', tracking: TRACKING[item.trackingMode],
          price: `${formatInr(item.unitSalePrice)} per ${UNITS[item.unitOfMeasure]}`, status: <StatusPill status={item.active ? 'ACTIVE' : 'ARCHIVED'} />,
        } }))} />
      {data && data.total > data.pageSize && <nav className="action-row" aria-label="Product pages">
        <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous products</button><span>Page {page}</span>
        <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next products</button>
      </nav>}
    </section>}
    {seesPackages && view === 'packages' && <section className="pattern-card titled-list">
      <h2>System packages</h2>
      <ListPattern title="System packages" loading={packages.isPending} error={packages.error ? describeProblem(packages.error).message : undefined}
        onRetry={() => void packages.refetch()} empty="No packages yet."
        columns={[{ id: 'name', label: 'Package' }, { id: 'system', label: 'System' }, { id: 'hardware', label: 'Hardware' }, { id: 'install', label: 'Installation' }, { id: 'total', label: 'Total' }, { id: 'status', label: 'Status' }]}
        rows={(packages.data?.data.items ?? []).map((item) => ({ id: item.id, cells: {
          name: <>{item.name}<small className="cell-sub">{item.code}</small></>,
          system: `${item.capacityKw} kW ${item.systemType === 'ON_GRID' ? 'On-Grid' : 'Off-Grid'}`,
          hardware: formatInr(item.hardwarePrice), install: formatInr(item.installationPrice), total: <strong>{formatInr(item.totalPrice)}</strong>,
          status: <StatusPill status={item.active ? 'ACTIVE' : 'ARCHIVED'} />,
        } }))} />
    </section>}
  </section>;
}
