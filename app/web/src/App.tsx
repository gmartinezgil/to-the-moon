import { useCallback, useEffect, useState } from 'react';
import { api, type Balances, type PricePoint, type PriceQuote } from './api';
import Dashboard from './screens/Dashboard';
import Retirement from './screens/Retirement';
import Payments from './screens/Payments';
import Directory from './screens/Directory';
import { mxn } from './format';

type View = 'home' | 'retirement' | 'payments' | 'directory';

const NAV: { id: View; icon: string }[] = [
  { id: 'home', icon: 'fa-house' },
  { id: 'retirement', icon: 'fa-chart-line' },
  { id: 'payments', icon: 'fa-bolt' },
  { id: 'directory', icon: 'fa-layer-group' },
];

export default function App() {
  const [view, setView] = useState<View>('home');
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [price, wallet] = await Promise.all([api.price(), api.wallet()]);
      setQuote(price.quote);
      setHistory(price.history);
      setBalances(wallet.balances);
      setApiError(null);
    } catch (err) {
      setApiError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

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
        {view === 'home' && <Dashboard quote={quote} history={history} balances={balances} onChanged={refresh} />}
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
