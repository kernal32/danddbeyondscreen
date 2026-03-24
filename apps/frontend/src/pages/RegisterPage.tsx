import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPost, ApiHttpError } from '../api';
import { USER_EMAIL_KEY, USER_TOKEN_KEY } from '../auth-storage';

export default function RegisterPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await apiPost<{ token: string; user: { email: string } }>('/api/auth/register', { email, password });
      localStorage.setItem(USER_TOKEN_KEY, res.token);
      localStorage.setItem(USER_EMAIL_KEY, res.user.email);
      nav('/account');
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 404) {
        setErr('Registration is not enabled on this server (set AUTH_SECRET on the backend).');
      } else {
        setErr(e instanceof Error ? e.message : 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 max-w-md mx-auto">
      <h1 className="text-3xl font-display font-bold text-[var(--accent)]">Create account</h1>
      <p className="text-[var(--muted)] text-center text-sm">Password must be at least 10 characters. Use HTTPS in production.</p>
      <label className="w-full text-sm text-[var(--muted)]">
        Email
        <input
          type="email"
          autoComplete="email"
          className="mt-1 w-full rounded-lg bg-[color-mix(in_srgb,var(--surface-elevated)_75%,transparent)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text)]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="w-full text-sm text-[var(--muted)]">
        Password
        <input
          type="password"
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg bg-[color-mix(in_srgb,var(--surface-elevated)_75%,transparent)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text)]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={loading}
        onClick={() => void submit()}
        className="w-full rounded-lg bg-[var(--btn-primary-bg)] px-4 py-2 font-semibold text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Register'}
      </button>
      {err && <p className="text-[var(--danger)] text-sm text-center">{err}</p>}
      <p className="text-sm text-[var(--muted)]">
        <Link to="/login" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
          Sign in instead
        </Link>
        {' · '}
        <Link to="/" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
          Home
        </Link>
      </p>
    </div>
  );
}
