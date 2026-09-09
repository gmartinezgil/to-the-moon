import { useState } from 'react';
import { api, AUTH_POLICY } from '../api';

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        const res = await api.forgot(email);
        setNotice(
          'If that address is registered, a reset link has been sent. ' +
            (res.resetToken
              ? `(Demo mode — reset token: ${res.resetToken})`
              : ''),
        );
        setMode('login');
        setLoading(false);
        return;
      }
      await (mode === 'login' ? api.login(email, password) : api.register(email, password, displayName || undefined));
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: 'login' | 'register' | 'forgot') {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  const policyErrors: string[] = [];
  if (mode === 'register') {
    if (password.length > 0) {
      if (password.length < AUTH_POLICY.minLength) policyErrors.push(`At least ${AUTH_POLICY.minLength} characters`);
      if (!/[a-z]/.test(password)) policyErrors.push('A lowercase letter');
      if (!/[A-Z]/.test(password)) policyErrors.push('An uppercase letter');
      if (!/[0-9]/.test(password)) policyErrors.push('A number');
      if (!/[^A-Za-z0-9]/.test(password)) policyErrors.push('A symbol');
    }
  }

  const input =
    'w-full bg-slate-800 text-white rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FFDE3A] placeholder:text-slate-500';

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-black mb-1 text-[#FFDE3A]">To The Moon</h1>
        <p className="text-sm text-gray-400 mb-8 font-bold">Self-custody Bitcoin savings</p>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input
              className={input}
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
            />
          )}
          <input
            className={input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
          {mode !== 'forgot' && (
            <input
              className={input}
              type="password"
              placeholder={mode === 'register' ? `Password (min. ${AUTH_POLICY.minLength} chars)` : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={AUTH_POLICY.minLength}
            />
          )}

          {mode === 'register' && (
            <ul className="text-[11px] space-y-0.5">
              {policyErrors.length === 0 && password.length > 0 ? (
                <li className="text-emerald-400 font-bold">Password meets policy</li>
              ) : (
                policyErrors.map((p) => <li key={p} className="text-slate-400">{p}</li>)
              )}
            </ul>
          )}

          {error && <p className="text-xs text-red-400 font-bold">{error}</p>}
          {notice && <p className="text-xs text-emerald-400 font-bold whitespace-pre-wrap">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFDE3A] text-black rounded-2xl py-3 font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        <div className="mt-6 space-y-1 text-center text-xs text-gray-400">
          {mode !== 'login' && (
            <button className="text-[#FFDE3A] font-bold underline" onClick={() => switchMode('login')}>
              Back to log in
            </button>
          )}
          {mode === 'login' && (
            <div className="flex justify-center gap-4">
              <button className="text-[#FFDE3A] font-bold underline" onClick={() => switchMode('register')}>
                Create an account
              </button>
              <button className="text-[#FFDE3A] font-bold underline" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
            </div>
          )}
        </div>
        <p className="text-center mt-6 text-[10px] text-slate-500">
          This is a demo environment. Data is stored locally in your browser and on the server.
        </p>
      </div>
    </div>
  );
}