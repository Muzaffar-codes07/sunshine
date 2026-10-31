import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServiceWorkspacePage } from '../src/features/service';
import { ReportsWorkspacePage } from '../src/features/reports';
import '../src/styles.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Preview() {
  const [page, setPage] = useState<'service' | 'reports'>('service');
  return <main className="staff-shell">
    <p>Development review only. Uses the real local API; ticket writes are disabled. Sign in through /login first for authorized reads.</p>
    <nav aria-label="Feature preview"><button onClick={() => setPage('service')}>Service preview</button>{' '}
      <button onClick={() => setPage('reports')}>Reports preview</button></nav>
    {page === 'service' ? <ServiceWorkspacePage /> : <ReportsWorkspacePage />}
  </main>;
}

const root = document.getElementById('root');
if (import.meta.env.DEV && root) {
  createRoot(root).render(<StrictMode><QueryClientProvider client={client}><Preview /></QueryClientProvider></StrictMode>);
}
