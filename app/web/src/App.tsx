import { useCallback, useEffect, useState } from 'react';
import { api, subscribeToPush, type Balances, type PricePoint, type PriceQuote, type Transaction } from './api';
import Dashboard from './screens/Dashboard';
import Retirement from './screens/Retirement';
import Payments from './screens/Payments';
import Directory from './screens/Directory';
import Login from './screens/Login';
import { mxn } from './format';

type View = 'home' | 'retirement' | 'payments' | 'directory';

const NAV: { id: View; icon: string }[] = [
  { id: 'home', icon: 'fa-house' },
  { id: 'retirement', icon: 'fa-chart-line' },
  { id: 'payments', icon: 'fa-bolt' },
  { id: 'directory', icon: 'fa-layer-group' },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('home');
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  // Establish auth on first load: if the session cookie is valid, enter the app.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(() => { if (!cancelled) setAuthed(true); })
      .catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [price, wallet] = await Promise.all([api.price(), api.wallet()]);
      setQuote(price.quote);
      setHistory(price.history);
      setBalances(wallet.balances);
      setTransactions(wallet.transactions);
      setApiError(null);
    } catch (err) {
      setApiError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    refresh();
    const timer = setInterval(refresh, 30000);
    if ('Notification' in window && Notification.permission === 'default') {
      // Offer push notifications once, silently if declined.
      Notification.requestPermission().then((p) => {
        if (p === 'granted') subscribeToPush();
      });
    }
    return () => clearInterval(timer);
  }, [authed, refresh]);

  if (authed === null) {
    return <div className="min-h-screen bg-[#0f172a]" />;
  }

  if (authed === false) {
    return <Login onAuthed={() => setAuthed(true)} />;
  }

  if (apiError) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-8 text-center">
        <div>
          <p className="font-black text-xl mb-2">API unreachable</p>
          <p className="text-sm text-gray-400 mb-4">{apiError}</p>
          <p className="text-xs text-gray-500">Make sure the server is running: <code className="bg-slate-800 px-1 rounded">npm run dev -w server</code></p>
        </div>
      </div>
    );
  }

  if (!quote || !balances) {
    return <div className="min-h-screen bg-[#0f172a]" />;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-[375px] h-[812px] bg-[#FFDE3A] rounded-[45px] border-[12px] border-[#1e293b] relative overflow-hidden shadow-2xl">
        {view === 'home' && (
          <Dashboard quote={quote} history={history} balances={balances} transactions={transactions} onChanged={refresh} />
        )}
        {view === 'retirement' && <Retirement quote={quote} balances={balances} />}
        {view === 'payments' && <Payments quote={quote} />}
        {view === 'directory' && <Directory quote={quote} />}

        <div className="absolute bottom-6 left-1/2 -ml-[150px] w-[300px] h-[68px] bg-black rounded-full flex justify-around items-center px-4 z-50 shadow-2xl">
          {NAV.map(({ id, icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`text-xl transition-all ${view === id ? 'text-[#FFDE3A] scale-125' : 'text-gray-600 hover:text-gray-400'}`}
            >
              <i className={`fa-solid ${icon}`} />
            </button>
          ))}
        </div>
      </div>
      <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-600">Total Wealth: {mxn(balances.totalMxn, 2)}</p>
    </div>
  );
}
