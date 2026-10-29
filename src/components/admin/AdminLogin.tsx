'use client';
import { useState } from 'react';

export function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mx-auto mt-24 max-w-sm space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        setBusy(false);
        if (res.ok) window.location.reload();
        else setError(((await res.json()).errors ?? ['Login failed']).join(' '));
      }}
    >
      <h1 className="font-display text-3xl">Admin sign-in</h1>
      <label className="block text-sm">
        Password
        <input type="password" autoComplete="current-password" className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password" />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy || !password} data-testid="admin-login">{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="text-xs text-mute">The password is set by ADMIN_PASSWORD in .env.local on the server.</p>
    </form>
  );
}
