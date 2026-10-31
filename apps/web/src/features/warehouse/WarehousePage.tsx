import { useState } from 'react';
import { Link } from 'react-router-dom';
import { stockDocumentKindSchema } from '@sunshine/contracts';
import { ScanInput, type ScanSource } from '../../components/device/ScanInput';
import { DetailPattern, ListPattern } from '../../components/shared/patterns';
import { Field } from '../../components/ui/Field';
import { useStaffSession } from '../auth/session';
import { StockReceiptDrawer } from './StockReceiptDrawer';
import {
  describeProblem,
  useStockAsOf,
  useStockIntegrity,
  useStockLevels,
  useStockLocations,
  useStockMovements,
  useStockValue,
  useUnitLookup,
} from './queries';

type Tab = 'levels' | 'movements' | 'integrity' | 'valuation' | 'unit-lookup';

export function WarehousePage() {
  const session = useStaffSession();
  const [activeTab, setActiveTab] = useState<Tab>('levels');
  const [receiptOpen, setReceiptOpen] = useState(false);

  if (session.isPending) return <p role="status">Checking your session…</p>;
  if (session.error) return <p role="alert">{describeProblem(session.error).message}</p>;
  const actor = session.data;
  if (!actor) {
    return (
      <main className="enquiry-page">
        <p>
          <Link to="/login">Sign in to view the warehouse workspace</Link>
        </p>
      </main>
    );
  }
  if (!['WAREHOUSE', 'ADMIN'].includes(actor.role)) {
    return (
      <div role="alert" className="form-error">
        <h1>Unauthorized</h1>
        <p>Your role ({actor.role}) cannot access the warehouse workspace.</p>
        <p>
          <Link to="/workspace">Back to workspace overview</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="warehouse-workspace">
      <header className="warehouse-header">
        <div>
          <h1>Warehouse & Stock Management</h1>
          <p className="field-hint">
            Live inventory ledger, movement history, unit serial traceability, and invariant verification.
          </p>
        </div>
        <div className="warehouse-header-actions">
          <button type="button" onClick={() => setReceiptOpen(true)}>
            + Inward Stock / Receive
          </button>
        </div>
      </header>

      <nav className="warehouse-tabs" aria-label="Warehouse sections">
        <button
          type="button"
          className={activeTab === 'levels' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('levels')}
        >
          Stock Balances
        </button>
        <button
          type="button"
          className={activeTab === 'movements' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('movements')}
        >
          Movement Ledger
        </button>
        <button
          type="button"
          className={activeTab === 'integrity' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('integrity')}
        >
          Integrity & Audit
        </button>
        <button
          type="button"
          className={activeTab === 'valuation' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('valuation')}
        >
          Valuation
        </button>
        <button
          type="button"
          className={activeTab === 'unit-lookup' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('unit-lookup')}
        >
          Unit & Serial Scan
        </button>
      </nav>

      <section className="warehouse-content">
        {activeTab === 'levels' && <StockLevelsSection />}
        {activeTab === 'movements' && <StockMovementsSection />}
        {activeTab === 'integrity' && <StockIntegritySection />}
        {activeTab === 'valuation' && <StockValuationSection />}
        {activeTab === 'unit-lookup' && <UnitLookupSection />}
      </section>

      <StockReceiptDrawer open={receiptOpen} onClose={() => setReceiptOpen(false)} />
    </div>
  );
}

function StockLevelsSection() {
  const [locationId, setLocationId] = useState('');
  const [page, setPage] = useState(1);
  const [asOfDate, setAsOfDate] = useState('');

  const locations = useStockLocations();
  const currentLevels = useStockLevels({
    locationId: locationId || undefined,
    page,
    pageSize: 25,
  });
  const asOfLevels = useStockAsOf({
    at: asOfDate ? new Date(asOfDate).toISOString() : undefined,
    locationId: locationId || undefined,
    page,
    pageSize: 25,
  });

  const isAsOf = Boolean(asOfDate);
  const activeQuery = isAsOf ? asOfLevels : currentLevels;
  const items = activeQuery.data?.data.items ?? [];
  const total = activeQuery.data?.data.total ?? 0;
  const pageSize = activeQuery.data?.data.pageSize ?? 25;
  const maxPages = Math.max(1, Math.ceil(total / pageSize));

  const columns = [
    { id: 'sku', label: 'SKU' },
    { id: 'product', label: 'Product' },
    { id: 'location', label: 'Location' },
    { id: 'onHand', label: 'On Hand' },
    ...(isAsOf
      ? []
      : [
          { id: 'reserved', label: 'Reserved' },
          { id: 'free', label: 'Free to Promise' },
        ]),
  ];

  return (
    <div className="stock-levels-view">
      <div className="filters-row">
        <Field label="Warehouse location">
          {(c) => (
            <select
              {...c}
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All locations</option>
              {(locations.data?.data ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} - {loc.name} ({loc.kind})
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="As-Of Date (optional)"
          hint="Leave blank for live current balances, or choose a timestamp to audit past balances."
        >
          {(c) => (
            <input
              {...c}
              type="datetime-local"
              value={asOfDate}
              onChange={(e) => {
                setAsOfDate(e.target.value);
                setPage(1);
              }}
            />
          )}
        </Field>
      </div>

      <ListPattern
        title={isAsOf ? `Historical Stock As-Of ${asOfDate} (${total})` : `Current Stock Levels (${total})`}
        columns={columns}
        loading={activeQuery.isPending}
        error={activeQuery.error ? describeProblem(activeQuery.error).message : undefined}
        onRetry={() => void activeQuery.refetch()}
        empty="No stock records found for the selected filters."
        rows={items.map((item, idx) => {
          const cells: Record<string, React.ReactNode> = {
            sku: <code>{item.sku}</code>,
            product: item.productName,
            location: `${item.locationCode} (${item.locationKind})`,
            onHand: <strong>{item.onHand}</strong>,
          };
          if (!isAsOf && 'free' in item && typeof item.free === 'string' && 'reserved' in item && typeof item.reserved === 'string') {
            cells.reserved = item.reserved;
            cells.free = (
              <span className={item.free.startsWith('-') ? 'form-error font-bold' : ''}>
                {item.free}
              </span>
            );
          }
          return {
            id: `${item.productId}-${item.locationId}-${idx}`,
            cells,
          };
        })}
      />

      {maxPages > 1 && (
        <nav className="pager" aria-label="Stock pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {maxPages}
          </span>
          <button disabled={page >= maxPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

function StockMovementsSection() {
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);

  const movements = useStockMovements({
    kind: kind || undefined,
    page,
    pageSize: 25,
  });

  const data = movements.data?.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const maxPages = data ? Math.max(1, Math.ceil(total / data.pageSize)) : 1;

  const columns = [
    { id: 'occurredAt', label: 'Occurred At' },
    { id: 'reference', label: 'Reference' },
    { id: 'kind', label: 'Movement Kind' },
    { id: 'sku', label: 'SKU' },
    { id: 'product', label: 'Product Name' },
    { id: 'quantity', label: 'Quantity' },
  ];

  return (
    <div className="stock-movements-view">
      <div className="filters-row">
        <Field label="Filter by document kind">
          {(c) => (
            <select
              {...c}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All document kinds</option>
              {stockDocumentKindSchema.options.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <ListPattern
        title={`Stock Movements Ledger (${total})`}
        columns={columns}
        loading={movements.isPending}
        error={movements.error ? describeProblem(movements.error).message : undefined}
        onRetry={() => void movements.refetch()}
        empty="No movement records recorded yet."
        rows={items.map((m) => ({
          id: m.id,
          cells: {
            occurredAt: <time>{new Date(m.occurredAt).toLocaleString('en-IN')}</time>,
            reference: <code>{m.reference}</code>,
            kind: <span className="stage">{m.documentKind}</span>,
            sku: <code>{m.sku}</code>,
            product: m.productName,
            quantity: <strong>+{m.quantity}</strong>,
          },
        }))}
      />

      {maxPages > 1 && (
        <nav className="pager" aria-label="Movement pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {maxPages}
          </span>
          <button disabled={page >= maxPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

function StockIntegritySection() {
  const integrity = useStockIntegrity();
  const data = integrity.data?.data;

  return (
    <div className="stock-integrity-view">
      <header className="integrity-status-banner">
        <div>
          <h2>Stock Ledger Invariant Audit</h2>
          <p className="field-hint">
            Validates no negative on-hand balances, exact ledger reconciliation, and unit-tracking integrity.
          </p>
          {data && (
            <p className="field-hint">
              Last checked: <time>{new Date(data.checkedAt).toLocaleString('en-IN')}</time>
            </p>
          )}
        </div>
        <div className="integrity-status-pill">
          {data ? (
            <span
              className="stage"
              style={{
                borderColor: data.ok ? '#53d6a1' : '#ffb4ab',
                color: data.ok ? '#53d6a1' : '#ffb4ab',
                fontWeight: 700,
              }}
            >
              {data.ok ? '✓ System Invariants Healthy' : '✕ Invariant Discrepancies Detected'}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void integrity.refetch()}
            disabled={integrity.isPending}
          >
            {integrity.isPending ? 'Verifying…' : 'Run Audit'}
          </button>
        </div>
      </header>

      {integrity.isPending && <p role="status">Verifying inventory ledger invariants…</p>}
      {integrity.error && (
        <div role="alert" className="form-error">
          <p>{describeProblem(integrity.error).message}</p>
          <button type="button" onClick={() => void integrity.refetch()}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="table-scroll" style={{ marginTop: '20px' }}>
          <table>
            <caption>Integrity check results ({data.checks.length} assertions)</caption>
            <thead>
              <tr>
                <th scope="col">Check Assertion</th>
                <th scope="col">Description</th>
                <th scope="col">Result</th>
                <th scope="col">Discrepancies</th>
                <th scope="col">Sample IDs</th>
              </tr>
            </thead>
            <tbody>
              {data.checks.map((chk) => (
                <tr key={chk.code}>
                  <td>
                    <code>{chk.code}</code>
                  </td>
                  <td>{chk.description}</td>
                  <td>
                    <span
                      style={{
                        color: chk.ok ? '#53d6a1' : '#ffb4ab',
                        fontWeight: 600,
                      }}
                    >
                      {chk.ok ? 'PASSED' : 'FAILED'}
                    </span>
                  </td>
                  <td>{chk.count}</td>
                  <td>
                    {chk.samples.length > 0 ? (
                      <code>{chk.samples.slice(0, 3).join(', ')}</code>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StockValuationSection() {
  const valuation = useStockValue();
  const data = valuation.data?.data;
  const items = data?.items ?? [];

  return (
    <div className="stock-valuation-view">
      {data && (
        <div className="status-grid" style={{ marginBottom: '24px' }}>
          <article className="status-card">
            <div>
              <p>Total Usable Stock Value</p>
              <strong>₹ {Number(data.usableValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <span aria-hidden="true" className="dot ready" />
          </article>
          <article className="status-card">
            <div>
              <p>Quarantined Stock Value</p>
              <strong>₹ {Number(data.quarantineValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <span aria-hidden="true" className="dot" />
          </article>
          <article className="status-card">
            <div>
              <p>Uncosted Products Count</p>
              <strong>{data.uncostedProducts}</strong>
            </div>
            <span
              aria-hidden="true"
              className={data.uncostedProducts === 0 ? 'dot ready' : 'dot'}
            />
          </article>
        </div>
      )}

      <ListPattern
        title="Product Inventory Valuation Breakdown"
        columns={[
          { id: 'sku', label: 'SKU' },
          { id: 'product', label: 'Product' },
          { id: 'usableQty', label: 'Usable Quantity' },
          { id: 'usableVal', label: 'Usable Value (INR)' },
          { id: 'quarantineQty', label: 'Quarantine Quantity' },
          { id: 'quarantineVal', label: 'Quarantine Value (INR)' },
          { id: 'costStatus', label: 'Cost Basis' },
        ]}
        loading={valuation.isPending}
        error={valuation.error ? describeProblem(valuation.error).message : undefined}
        onRetry={() => void valuation.refetch()}
        empty="No inventory valuation records found."
        rows={items.map((row) => ({
          id: row.productId,
          cells: {
            sku: <code>{row.sku}</code>,
            product: row.productName,
            usableQty: row.usableQuantity,
            usableVal: `₹ ${Number(row.usableValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            quarantineQty: row.quarantineQuantity,
            quarantineVal: `₹ ${Number(row.quarantineValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            costStatus: row.costKnown ? 'Known' : <span className="form-error">Uncosted (counted as 0)</span>,
          },
        }))}
      />
    </div>
  );
}

function UnitLookupSection() {
  const [querySerial, setQuerySerial] = useState('');
  const [searchedSerial, setSearchedSerial] = useState('');

  const lookup = useUnitLookup(searchedSerial);
  const units = lookup.data?.data ?? [];

  const handleScan = (value: string, _source: ScanSource) => {
    setQuerySerial(value);
    setSearchedSerial(value);
  };

  return (
    <div className="unit-lookup-view">
      <section className="pattern-card">
        <h2>Serial Unit Scanner & Lookup</h2>
        <p className="field-hint">
          Scan equipment barcode using device camera, or type/scan with USB/Bluetooth scanner to look up physical status and lineage.
        </p>

        <ScanInput
          label="Equipment serial number"
          placeholder="Scan barcode or type serial…"
          hint="Press Enter or click Submit code to look up unit tracking facts."
          onScan={handleScan}
        />
      </section>

      {searchedSerial && (
        <div className="unit-lookup-results" style={{ marginTop: '20px' }}>
          <h3>Tracking records for &quot;{searchedSerial}&quot;</h3>

          {lookup.isPending && <p role="status">Searching equipment unit records…</p>}
          {lookup.error && (
            <div role="alert" className="form-error">
              <p>{describeProblem(lookup.error).message}</p>
              <button type="button" onClick={() => void lookup.refetch()}>
                Retry
              </button>
            </div>
          )}

          {!lookup.isPending && !lookup.error && units.length === 0 && (
            <p>No physical equipment units found with serial &quot;{searchedSerial}&quot;.</p>
          )}

          {units.map((unit) => (
            <DetailPattern
              key={unit.id}
              title={`Unit ${unit.serial}`}
              entries={[
                { id: 'norm', label: 'Normalized Serial', value: <code>{unit.normalizedSerial}</code> },
                { id: 'mfg', label: 'Manufacturer', value: unit.manufacturer },
                {
                  id: 'status',
                  label: 'Unit Status',
                  value: <span className="stage">{unit.status}</span>,
                },
                { id: 'loc', label: 'Location ID', value: unit.locationId ? <code>{unit.locationId}</code> : 'Outside warehouse' },
                { id: 'unitId', label: 'Unit UUID', value: <code>{unit.id}</code> },
              ]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
