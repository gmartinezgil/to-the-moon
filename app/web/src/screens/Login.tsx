import { useState } from 'react';
import { api, setToken } from '../api';

export default function Login({
  onAuthed,
}: {
  onAuthed: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, displayName || undefined);
      setToken(res.token);
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
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
            <input className={input} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          )}
          <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className={input} type="password" placeholder="Password (min. 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-xs text-red-400 font-bold">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFDE3A] text-black rounded-2xl py-3 font-black text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-gray-400">
          {mode === 'login' ? "New here?" : 'Already have an account?'}{' '}
          <button
            className="text-[#FFDE3A] font-bold underline"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
        <p className="text-center mt-6 text-[10px] text-slate-500">
          This is a demo environment. Data is stored locally in your browser and on the server.
        </p>
      </div>
    </div>
  );
}
