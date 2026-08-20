import React, { useState, useEffect } from 'react';
import DemoHome from './components/DemoHome';
import ClientView from './components/ClientView';
import AdminView from './components/AdminView';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import { ThemeProvider } from './theme/ThemeContext';

type View = 'checking' | 'login' | 'register' | 'admin' | 'client' | 'demo';

function MainApp() {
  const [view, setView] = useState<View>('checking');
  const [clientParams, setClientParams] = useState<{ est: string; tab: string }>({ est: '', tab: '' });

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const estParam = urlParams.get('establishment');
      const tabParam = urlParams.get('table');

      // QR scan: both params present — go straight to client view without auth check.
      if (estParam && tabParam) {
        setClientParams({ est: estParam, tab: tabParam });
        setView('client');
        return;
      }

      // Registration landing (e.g. invite link or direct navigation).
      if (window.location.pathname === '/register') {
        setView('register');
        return;
      }

      // Dev-only demo launcher, bypassed in production.
      if (import.meta.env.DEV && window.location.pathname === '/demo') {
        setView('demo');
        return;
      }

      // Everything else: try to rehydrate an existing session before showing login.
      fetch('/api/auth/me', { credentials: 'include' })
        .then((res) => {
          setView(res.ok ? 'admin' : 'login');
        })
        .catch(() => {
          setView('login');
        });
    } catch (e) {
      console.error('Failed to determine initial view:', e);
      setView('login');
    }
  }, []);

  const handleBackToLauncher = () => {
    try {
      window.history.pushState({}, '', window.location.pathname);
    } catch {
      // safe fallback
    }
    // In dev the demo launcher is a useful starting point; in production go to login.
    setView(import.meta.env.DEV ? 'demo' : 'login');
  };

  const handleLaunchClient = (estId: string, tableId: string) => {
    try {
      const newUrl = `${window.location.pathname}?establishment=${estId}&table=${tableId}`;
      window.history.pushState({}, '', newUrl);
    } catch {
      // safe fallback
    }
    setClientParams({ est: estId, tab: tableId });
    setView('client');
  };

  const handleLaunchAdmin = () => {
    setView('admin');
  };

  if (view === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative font-sans transition-colors duration-300">
      {view === 'login' && (
        <LoginPage
          onLoginSuccess={() => setView('admin')}
          onGoToRegister={() => setView('register')}
        />
      )}

      {view === 'register' && (
        <RegisterPage
          onRegisterSuccess={() => setView('admin')}
          onGoToLogin={() => setView('login')}
        />
      )}

      {view === 'demo' && (
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

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}
