import { OrderPage } from '../features/orders/OrderPage';
import { Link, Route, Routes } from 'react-router-dom';
import { PublicEnquiryPage } from '../features/sales/PublicEnquiryPage';
import { EnquiryDetailPage } from '../features/sales/EnquiryDetailPage';
import { SalesWorkspacePage } from '../features/sales/EnquiryQueuePage';
import { FieldJobPage } from '../features/field/FieldJobPage';
import { FieldJobsPage } from '../features/field/FieldJobsPage';
import { OrderFulfilmentPage } from '../features/warehouse/OrderFulfilmentPage';
import { WarehousePage } from '../features/warehouse/WarehousePage';
import { LoginPage } from '../features/auth/LoginPage';
import { Workspace } from './Workspace';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ServiceWorkspaceRoute } from '../features/service/ServiceWorkspaceRoute';
import { ReportsWorkspacePage } from '../features/reports';
import { PatternsPage } from './PatternsPage';
import { CapabilitySpikePage } from '../features/field/CapabilitySpikePage';
import { EquipmentPage } from '../features/equipment/EquipmentPage';
import { TeamPage } from '../features/team/TeamPage';
import { LandingPage } from '../features/landing/LandingPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/enquire" element={<PublicEnquiryPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspace" element={<Workspace />}>
        <Route index element={<DashboardPage />} />
        <Route path="sales" element={<SalesWorkspacePage />} />
        <Route path="orders" element={<OrderPage />} />
        <Route path="orders/:id" element={<OrderPage />} />
        <Route path="sales/enquiries/:id" element={<EnquiryDetailPage />} />
        <Route path="field-service" element={<FieldJobsPage />} />
        <Route path="field-service/jobs/:id" element={<FieldJobPage />} />
        <Route path="warehouse" element={<WarehousePage />} />
        <Route path="warehouse/orders/:id" element={<OrderFulfilmentPage />} />
        <Route path="service" element={<ServiceWorkspaceRoute />} />
        <Route path="reports" element={<ReportsWorkspacePage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="*" element={<><h1>Page not found</h1><Link to="/workspace">Back to overview</Link></>} />
      </Route>
      {import.meta.env.DEV && <Route path="/patterns" element={<PatternsPage />} />}
      {import.meta.env.DEV && <Route path="/spike" element={<CapabilitySpikePage />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return <main className="enquiry-page"><h1>Page not found</h1><p><Link to="/">Go to the Solar OS home page</Link></p></main>;
}

