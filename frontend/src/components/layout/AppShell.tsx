import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const AppShell: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="app-container">
      <Sidebar
        onRefresh={handleRefresh}
      />
      <div className="main-wrapper">
        <main className="content-container">
          <Outlet key={refreshKey} />
        </main>
      </div>
    </div>
  );
};

