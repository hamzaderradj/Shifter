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

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-secondary">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return isAuthenticated ? children : <Navigate to="/login" replace />;
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
          <Route index element={<DashboardPage />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="rides" element={<RidesPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="sos" element={<SosAlertsPage />} />
          <Route path="moderation" element={<ModerationPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
