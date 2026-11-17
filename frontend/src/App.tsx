import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { ShipmentsPage } from './pages/ShipmentsPage';
import { ShipmentDetailPage } from './pages/ShipmentDetailPage';
import { DevicesPage } from './pages/DevicesPage';
import { DataIntegrityPage } from './pages/DataIntegrityPage';
import { EventsPage } from './pages/EventsPage';
import { LoginPage } from './pages/LoginPage';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { ToastProvider } from './components/feedback/Toast';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<AppShell />}>
                <Route index element={<OverviewPage />} />
                <Route path="shipments" element={<ShipmentsPage />} />
                <Route path="shipments/:id" element={<ShipmentDetailPage />} />
                <Route path="devices" element={<DevicesPage />} />
                <Route path="integrity" element={<DataIntegrityPage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
