import React, { useState, useEffect } from 'react';
import DemoHome from './components/DemoHome';
import ClientView from './components/ClientView';
import AdminView from './components/AdminView';

export default function App() {
  const [view, setView] = useState<'launcher' | 'client' | 'admin'>('launcher');
  const [clientParams, setClientParams] = useState<{ est: string; tab: string }>({ est: '', tab: '' });

  // Read URL query parameters on startup to simulate physical QR Code scanning
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const estParam = urlParams.get('establishment');
      const tabParam = urlParams.get('table');

      if (estParam && tabParam) {
        setClientParams({ est: estParam, tab: tabParam });
        setView('client');
      } else {
        // Double check if we want to reset back to main launcher on empty search
        setView('launcher');
      }
    } catch (e) {
      console.error('Failed to parse query parameters:', e);
    }
  }, []);

  // Back actions
  const handleBackToLauncher = () => {
    // Clear URL query parameters for clean demo experience
    try {
      window.history.pushState({}, '', window.location.pathname);
    } catch (e) {
      // safe fallback
    }
    setView('launcher');
  };

  const handleLaunchClient = (estId: string, tableId: string) => {
    // Update URL to make copyable shareable QR links! Excellent developer touch.
    try {
      const newUrl = `${window.location.pathname}?establishment=${estId}&table=${tableId}`;
      window.history.pushState({}, '', newUrl);
    } catch (e) {
      // safe fallback
    }
    setClientParams({ est: estId, tab: tableId });
    setView('client');
  };

  const handleLaunchAdmin = () => {
    setView('admin');
  };

  return (
    <div className="min-h-screen bg-[#FCFAF7]">
      {view === 'launcher' && (
        <DemoHome 
          onLaunchClient={handleLaunchClient} 
          onLaunchAdmin={handleLaunchAdmin} 
        />
      )}

      {view === 'client' && (
        <ClientView 
          establishmentId={clientParams.est} 
          tableId={clientParams.tab} 
          onBackToLauncher={handleBackToLauncher} 
        />
      )}

      {view === 'admin' && (
        <AdminView 
          onBackToLauncher={handleBackToLauncher} 
        />
      )}
    </div>
  );
}
