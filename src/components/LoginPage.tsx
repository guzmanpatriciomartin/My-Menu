import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../lib/firebase-client';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onGoToRegister: () => void;
}

export default function LoginPage({ onLoginSuccess, onGoToRegister }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  // Set when Firebase authenticated the user but the server has no establishment for them.
  // Credentials are valid, so instead of dead-ending we ask for the venue name and finish
  // provisioning onto the account that already exists.
  const [needsVenue, setNeedsVenue] = useState(false);
  const [venueName, setVenueName] = useState('');

  // Shared by both auth paths: a 200 login does not guarantee a usable session.
  async function finishLogin(): Promise<boolean> {
    // A 200 login does not guarantee a usable session: the browser can still refuse the
    // cookie. Over HTTPS it is sent SameSite=None; Secure; Partitioned so it survives an
    // embedded context (ADR-008), but a browser without CHIPS support — Safari — drops it
    // anyway. Without this check the panel mounts, its own /api/auth/me returns 401, and the
    // user is bounced back here with no explanation, indistinguishable from a wrong password.
    const check = await fetch('/api/auth/me', { credentials: 'include' });
    if (!check.ok) {
      setError(
        'Tus credenciales son correctas, pero el navegador no guardó la cookie de sesión. ' +
        'Si estás dentro de una vista previa embebida, probá en Chrome o abrí la app en una pestaña propia.'
      );
      return false;
    }
    onLoginSuccess();
    return true;
  }

  // The seed users in src/server/users.ts exist only as scrypt credentials — they were never
  // created in Firebase Auth, so signInWithEmailAndPassword rejects them. They are still the
  // documented way into the demo tenants, so fall back to the legacy endpoint rather than
  // telling the user their password is wrong.
  async function tryLegacyLogin(): Promise<boolean> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    return finishLogin();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResetSent(false);
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      const res = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'NO_TENANT') {
          setNeedsVenue(true);
          return;
        }
        setError(data.error ?? 'No se pudo iniciar sesión. Intentá de nuevo.');
        return;
      }

      await finishLogin();
    } catch (err: any) {
      const code: string = err?.code ?? '';
      const rejected =
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-email';

      if (rejected) {
        // Firebase does not know this account; it may still be a scrypt-only seed user.
        try {
          if (await tryLegacyLogin()) return;
        } catch {
          // fall through to the generic message below
        }
        setError('Email o contraseña incorrectos');
      } else {
        setError('Ocurrió un error. Intentá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Re-authenticate to get a fresh ID token: the one from handleSubmit may be minutes old by
  // the time the venue name is typed, and the server verifies expiry.
  async function handleCreateVenue(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      const res = await fetch('/api/auth/register-firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken, establishmentName: venueName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo crear el local. Intentá de nuevo.');
        return;
      }

      onLoginSuccess();
    } catch {
      setError('Ocurrió un error. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError('');
    setResetSent(false);
    if (!email) {
      setError('Ingresá tu email para recuperar la contraseña.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch {
      setError('No se pudo enviar el correo de recuperación.');
    }
  }

  if (needsVenue) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Falta tu local</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Tu cuenta existe pero todavía no tiene un local asociado. Poné el nombre y lo creamos.
          </p>

          <form onSubmit={handleCreateVenue} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del local</label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                required
                minLength={2}
                maxLength={60}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="La Bodeguita"
                autoFocus
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || venueName.trim().length < 2}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? 'Creando...' : 'Crear mi local'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setNeedsVenue(false); setError(''); setVenueName(''); }}
            className="mt-4 w-full text-sm text-gray-500 hover:underline text-center"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Mi Menu</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Iniciá sesión en tu local</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="hola@tulocal.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          {resetSent && (
            <p className="text-green-600 text-sm">
              Te enviamos un correo para recuperar tu contraseña.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleForgotPassword}
          className="mt-3 w-full text-sm text-orange-500 hover:underline text-center"
        >
          Olvidé mi contraseña
        </button>

        <div className="mt-6 border-t border-gray-200 pt-5 text-center">
          <p className="text-sm text-gray-500">
            ¿No tenés cuenta?{' '}
            <button
              type="button"
              onClick={onGoToRegister}
              className="text-orange-500 font-medium hover:underline"
            >
              Registrá tu local
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
