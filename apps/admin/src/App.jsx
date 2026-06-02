import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';

import Layout from './components/Layout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import DriversPage from './pages/Drivers';
import UsersPage from './pages/Users';
import RidesPage from './pages/Rides';
import AnalyticsPage from './pages/Analytics';
import SosAlertsPage from './pages/SosAlerts';
import ModerationPage from './pages/Moderation';
import SupportPage from './pages/Support';
import HealthPage from './pages/Health';
import NotificationsPage from './pages/Notifications';
import AuditLogPage from './pages/AuditLog';

function ProtectedRoute({ children, minRole }) {
  const { isAuthenticated, isLoading, hasRole } = useAuthStore();

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-secondary">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (minRole && !hasRole(minRole)) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-black text-secondary mb-2">Accès restreint</h2>
        <p className="text-gray-500">Votre rôle ne vous permet pas d'accéder à cette section.</p>
      </div>
    );
  }

  return children;
}

export default function App() {
  const { init } = useAuthStore();
  useEffect(() => { init(); }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index                element={<DashboardPage />} />
          <Route path="drivers"       element={<ProtectedRoute minRole="operations"><DriversPage /></ProtectedRoute>} />
          <Route path="users"         element={<ProtectedRoute minRole="support"><UsersPage /></ProtectedRoute>} />
          <Route path="rides"         element={<ProtectedRoute minRole="operations"><RidesPage /></ProtectedRoute>} />
          <Route path="analytics"     element={<ProtectedRoute minRole="finance"><AnalyticsPage /></ProtectedRoute>} />
          <Route path="sos"           element={<ProtectedRoute minRole="operations"><SosAlertsPage /></ProtectedRoute>} />
          <Route path="moderation"    element={<ProtectedRoute minRole="operations"><ModerationPage /></ProtectedRoute>} />
          <Route path="support"       element={<ProtectedRoute minRole="support"><SupportPage /></ProtectedRoute>} />
          <Route path="health"        element={<HealthPage />} />
          <Route path="notifications" element={<ProtectedRoute minRole="operations"><NotificationsPage /></ProtectedRoute>} />
          <Route path="audit"         element={<ProtectedRoute minRole="admin"><AuditLogPage /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
