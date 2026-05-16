import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

type Mode = 'signin' | 'signup';

// Supabase Auth requires an email-shaped identifier, so we map usernames to a
// synthetic email under a domain we never send mail to. Disable
// "Confirm email" in Supabase Auth → Email settings or sign-ups will hang
// waiting for confirmation that can never arrive.
const USERNAME_DOMAIN = 'vouch.local';

function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@${USERNAME_DOMAIN}`;
}

function validateUsername(u: string): string | null {
  if (u.length < 3) return 'Username must be at least 3 characters.';
  if (u.length > 32) return 'Username must be at most 32 characters.';
  if (!/^[a-zA-Z0-9_-]+$/.test(u)) return 'Username may only contain letters, numbers, _ and -.';
  return null;
}

export default function Auth() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/register';

  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="text-slate-400 font-mono">Loading…</div>;
  if (session) return <Navigate to={redirectTo} replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const trimmed = username.trim();
    const validationError = validateUsername(trimmed);
    if (validationError) {
      setError(validationError);
      setBusy(false);
      return;
    }
    const email = usernameToEmail(trimmed);
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: trimmed } },
        });
        if (err) throw err;
        if (data.session) {
          navigate(redirectTo, { replace: true });
        } else {
          // Email confirmation is on in the Supabase project. Sign them in
          // directly anyway — for fake-email usernames this will fail until
          // confirmation is turned off in the dashboard.
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            throw new Error(
              'Account created but email confirmation is enabled in Supabase. Disable it under Authentication → Providers → Email.',
            );
          }
          navigate(redirectTo, { replace: true });
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate(redirectTo, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <header className="space-y-2">
        <h2 className="text-4xl font-mono font-bold text-cyan-electric">
          {mode === 'signup' ? 'Sign up' : 'Sign in'}
        </h2>
        <p className="text-slate-400 text-sm">
          {mode === 'signup'
            ? 'Create an account to register a card and vouch for others.'
            : 'Sign in to your Vouch account.'}
        </p>
      </header>

      <div className="flex gap-2 border-b border-cyan-electric/15">
        <TabButton active={mode === 'signin'} onClick={() => { setMode('signin'); setError(null); }}>
          Sign in
        </TabButton>
        <TabButton active={mode === 'signup'} onClick={() => { setMode('signup'); setError(null); }}>
          Sign up
        </TabButton>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest">Username</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="e.g. red-fox-42"
            className="w-full bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric transition"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            className="w-full bg-navy-deep border border-cyan-electric/30 text-white font-mono px-4 py-3 rounded focus:outline-none focus:border-cyan-electric transition"
          />
        </div>
        {error && <div className="text-red-300 text-sm font-mono">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full px-6 py-3 rounded-full bg-cyan-electric text-navy-deep font-semibold disabled:opacity-40 hover:shadow-glow transition"
        >
          {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="text-xs text-slate-500 text-center">
        <Link to="/" className="hover:text-cyan-electric">← back to home</Link>
      </p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 font-mono text-sm border-b-2 -mb-px transition ${
        active
          ? 'border-cyan-electric text-cyan-electric'
          : 'border-transparent text-slate-400 hover:text-cyan-electric'
      }`}
    >
      {children}
    </button>
  );
}
