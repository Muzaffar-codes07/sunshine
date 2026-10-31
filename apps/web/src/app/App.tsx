import { OrderPage } from '../features/orders/OrderPage';
import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import { healthResponseSchema, readinessResponseSchema } from '@sunshine/contracts';
import { PublicEnquiryPage } from '../features/sales/PublicEnquiryPage';
import { EnquiryDetailPage } from '../features/sales/EnquiryDetailPage';
import { SalesWorkspacePage } from '../features/sales/EnquiryQueuePage';
import { FieldJobPage } from '../features/field/FieldJobPage';
import { FieldJobsPage } from '../features/field/FieldJobsPage';
import { OrderFulfilmentPage } from '../features/warehouse/OrderFulfilmentPage';
import { WarehousePage } from '../features/warehouse/WarehousePage';
import { apiGet } from '../lib/api';
import { LoginPage } from '../features/auth/LoginPage';
import { Workspace, WorkspaceOverview } from './Workspace';
import { ServiceWorkspacePage } from '../features/service';
import { ReportsWorkspacePage } from '../features/reports';
import { PatternsPage } from './PatternsPage';
import { CapabilitySpikePage } from '../features/field/CapabilitySpikePage';

const areas = ['Sales', 'Orders', 'Warehouse', 'Field & Service', 'Reports'];

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/enquire" element={<PublicEnquiryPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspace" element={<Workspace />}>
        <Route index element={<WorkspaceOverview />} />
        <Route path="sales" element={<SalesWorkspacePage />} />
        <Route path="orders" element={<OrderPage />} />
        <Route path="orders/:id" element={<OrderPage />} />
        <Route path="sales/enquiries/:id" element={<EnquiryDetailPage />} />
        <Route path="field-service" element={<FieldJobsPage />} />
        <Route path="field-service/jobs/:id" element={<FieldJobPage />} />
        <Route path="warehouse" element={<WarehousePage />} />
        <Route path="warehouse/orders/:id" element={<OrderFulfilmentPage />} />
        <Route path="service" element={<ServiceWorkspacePage />} />
        <Route path="reports" element={<ReportsWorkspacePage />} />
        <Route path="*" element={<><h1>Page not found</h1><Link to="/workspace">Back to overview</Link></>} />
      </Route>
      {import.meta.env.DEV && <Route path="/patterns" element={<PatternsPage />} />}
      {import.meta.env.DEV && <Route path="/spike" element={<CapabilitySpikePage />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return <main className="enquiry-page"><h1>Page not found</h1><p><Link to="/">Go to the Sunshine home page</Link></p></main>;
}

function Home() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => apiGet('/health', healthResponseSchema, signal) });
  const database = useQuery({ queryKey: ['readiness'], queryFn: ({ signal }) => apiGet('/health/ready', readinessResponseSchema, signal) });
  return (
    <main className="shell">
      <header><a className="brand" href="/" aria-label="Sunshine home"><span className="sun">☀</span> sunshine<span className="brand-tag">SOLAR OPERATIONS</span></a><span className="stage">Solar operations</span></header>
      <section className="hero">
        <p className="eyebrow">ONE CUSTOMER. ONE CONNECTED LIFECYCLE.</p>
        <h1>From rooftop enquiry<br />to years of reliable service.</h1>
        <p className="intro">Connect enquiries, surveys, orders, equipment and installation evidence for SunPower Solutions.</p>
        <p><Link to="/enquire">Make a solar enquiry</Link></p>
        <p><Link to="/login">Staff sign in</Link></p>
      </section>
      <section className="status-grid" aria-label="Live infrastructure status">
        <Status label="Application API" pending={health.isPending} error={health.error} ready={health.isSuccess} onRetry={() => void health.refetch()} />
        <Status label="Local PostgreSQL" pending={database.isPending} error={database.error} ready={database.isSuccess} onRetry={() => void database.refetch()} />
      </section>
      <section className="modules"><h2>Connected operations</h2><div className="module-grid">{areas.map((area, index) => <article key={area}><span className="module-number">0{index + 1}</span><h3>{area}</h3><p>Staff access required</p></article>)}</div></section>
      <footer>React + NestJS + local PostgreSQL <span>Shared contracts. Clear ownership. Real persistence.</span></footer>
    </main>
  );
}

function Status({ label, pending, error, ready, onRetry }: { label: string; pending: boolean; error: Error | null; ready: boolean; onRetry: () => void }) {
  return <article className="status-card"><div><p>{label}</p><strong role="status">{pending ? 'Checking connection…' : ready ? 'Connected' : 'Unavailable'}</strong></div><span aria-hidden="true" className={`dot ${ready ? 'ready' : ''}`} />{error && <div className="status-error"><p>{error.message}</p><button onClick={onRetry}>Retry connection</button></div>}</article>;
}
