import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/AppContext';

import Sidebar       from './components/layout/Sidebar';
import Header        from './components/layout/Header';
import ToastContainer from './components/layout/Toast';

import Dashboard    from './pages/Dashboard';
import WorkOrders   from './pages/WorkOrders';
import SLATracker   from './pages/SLATracker';
import Approvals    from './pages/Approvals';
import Notifications from './pages/Notifications';
import Contractors  from './pages/Contractors';
import Contracts    from './pages/Contracts';
import Login        from './pages/Login';
import InviteSignup from './pages/InviteSignup';
import RaiseRequest from './pages/RaiseRequest';
import Placeholder  from './pages/Placeholder';

import './styles/globals.css';

function FullPageMessage({ title, sub }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">{title}</h1>
        <p className="login-sub">{sub}</p>
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Header />
        <main className="page-content">
          <Routes>
            <Route path="/"              element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"     element={<Dashboard />} />
            <Route path="/work-orders"   element={<WorkOrders />} />
            <Route path="/sla"           element={<SLATracker />} />
            <Route path="/approvals"     element={<Approvals />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/contractors"   element={<Contractors />} />
            <Route path="/contracts"     element={<Contracts />} />
            <Route path="/assets"        element={<Placeholder title="Assets & Inventory" phase="Phase 2" description="Track equipment, assign assets to work orders, and log condition reports." />} />
            <Route path="/analytics"     element={<Placeholder title="Analytics & Reports" phase="Phase 3" description="Per-role dashboards, SLA trends, contractor performance, and PDF exports." />} />
            <Route path="/workforce"     element={<Placeholder title="Workforce" phase="Phase 2" description="Manage workmen, assign to supervisors, track attendance and skills." />} />
            <Route path="/raise"         element={<RaiseRequest />} />
            {/* Catch-all */}
            <Route path="*"              element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

function AppRoutes() {
  const { authLoading, isAuthenticated } = useApp();

  if (authLoading) {
    return <FullPageMessage title="Loading ServTrack" sub="Restoring your backend session..." />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/invite"
        element={<InviteSignup />}
      />
      <Route
        path="/*"
        element={isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
