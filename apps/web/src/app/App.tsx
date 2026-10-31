import { useQuery } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { healthResponseSchema, readinessResponseSchema } from '@sunshine/contracts';
import { apiGet } from '../lib/api';
import { PublicEnquiryPage } from '../features/sales/PublicEnquiryPage';
import { CapabilitySpikePage } from '../features/field/CapabilitySpikePage';

const areas = ['Sales', 'Orders', 'Warehouse', 'Field & Service', 'Reports'];

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/enquire" element={<PublicEnquiryPage />} />
      {import.meta.env.DEV && <Route path="/spike" element={<CapabilitySpikePage />} />}
    </Routes>
  );
}

function Home() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => apiGet('/health', healthResponseSchema, signal) });
  const database = useQuery({ queryKey: ['readiness'], queryFn: ({ signal }) => apiGet('/health/ready', readinessResponseSchema, signal) });
  return (
    <main className="shell">
      <header><a className="brand" href="/" aria-label="Sunshine home"><span className="sun">☀</span> sunshine<span className="brand-tag">SOLAR OPERATIONS</span></a><span className="stage">Development scaffold</span></header>
      <section className="hero">
        <p className="eyebrow">ONE CUSTOMER. ONE CONNECTED LIFECYCLE.</p>
        <h1>From rooftop enquiry<br />to years of reliable service.</h1>
        <p className="intro">The foundation for SunPower Solutions. Business workflows are planned and have not been implemented yet.</p>
      </section>
      <section className="status-grid" aria-label="Live infrastructure status">
        <Status label="Application API" pending={health.isPending} error={health.error} ready={health.isSuccess} onRetry={() => void health.refetch()} />
        <Status label="Local PostgreSQL"
