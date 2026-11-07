import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { ShipmentsPage } from './pages/ShipmentsPage';
import { ShipmentDetailPage } from './pages/ShipmentDetailPage';
import { DevicesPage } from './pages/DevicesPage';
import { DataIntegrityPage } from './pages/DataIntegrityPage';
import { EventsPage } from './pages/EventsPage';
import { DemoPage } from './pages/DemoPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="shipments" element={<ShipmentsPage />} />
          <Route path="shipments/:id" element={<ShipmentDetailPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="integrity" element={<DataIntegrityPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="demo" element={<DemoPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;

