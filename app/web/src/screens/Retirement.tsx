import { useEffect, useState } from 'react';
import { api, type Balances, type PriceQuote, type RetirementEstimate } from '../api';
import { SectionTitle } from '../components/ui';
import { btc, mxn } from '../format';

const ALPHA = [
  { label: 'BTC', value: 120, color: 'bg-black' },
  { label: 'S&P 500', value: 14, color: 'bg-slate-400' },
  { label: 'BONDS', value: 3, color: 'bg-slate-300' },
];

export default function Retirement({ quote, balances }: { quote: PriceQuote; balances: Balances }) {
  const [monthlyExp, setMonthlyExp] = useState('45000');
  const [extraBtc, setExtraBtc] = useState(0);
  const [estimate, setEstimate] = useState<RetirementEstimate | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const exp = Number(monthlyExp);
    if (!Number.isFinite(exp) || exp <= 0) return;
    const timer = setTimeout(() => {
      api.retirement(exp, extraBtc).then((res) => {
        setEstimate(res.estimate);
        setError('');
      }).catch((err) => setError((err as Error).message));
    }, 250);
    return () => clearTimeout(timer);
  }, [monthlyExp, extraBtc]);

  const progress = estimate?.progressPct ?? 0;

  return (
    <div className="animate-fadeInFast h-full bg-black">
      <div className="p-6 pt-12 h-[340px]">
        <div className="comfortaa text-[32px] font-bold text-[#FFDE3A] mt-6 leading-tight">Retirement Engine</div>
        <p className="text-gray-400 text-sm mt-2">
          Target Goal: <span className="text-white font-bold">{estimate ? btc(estimate.targetBtc, 2) : '—'} BTC</span>
        </p>

        <div className="mt-8 bg-[#FFDE3A] rounded-2xl p-4 text-black flex justify-between items-center shadow-xl">
          <div>
            <p className="text-[10px] font-bold uppercase opacity-60">
              Status: {estimate?.status ?? '—'}
            </p>
            <p className="text-2xl font-black">{estimate ? progress.toFixed(1) : '0.0'}%</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase opacity-60">Estimated Exit</p>
            <p className="text-2xl font-black">
              {estimate ? (estimate.yearsToExit === 0 ? 'NOW' : `${estimate.yearsToExit} Yrs`) : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="bottom-sheet no-scrollbar pb-32" style={{ top: 300 }}>
        <div className="mb-6">
          <label className="text-[10px] font-black text-gray-400 uppercase block mb-2">
            Monthly Expenses (MXN)
          </label>
          <input
            type="number"
            value={monthlyExp}
            onChange={(e) => setMonthlyExp(e.target.value)}
            className="bg-slate-100 rounded-2xl px-4 py-3 font-extrabold text-xl w-full outline-none"
          />
        </div>

        <div className="mb-8 bg-[#FFDE3A]/20 border-2 border-[#FFDE3A] rounded-3xl p-5">
          <div className="flex justify-between items-center mb-6">
            <label className="text-[12px] font-black text-black uppercase tracking-wide">
              Strategic Addition
            </label>
            <span className="text-lg font-black text-black bg-white px-3 py-1 rounded-full shadow-sm">
              +{btc(extraBtc, 1)} BTC
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={extraBtc}
            onChange={(e) => setExtraBtc(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="mb-8">
          <SectionTitle>Accumulation Path</SectionTitle>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 h-[140px] relative overflow-hidden">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full h-[80%]">
              <path
                d={`M0,40 L30,35 L60,28 L80,${40 - progress * 0.15} L100,2`}
                fill="none"
                stroke="#FFDE3A"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path d="M0,40 L100,40" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2" />
            </svg>
            <p className="text-xs font-bold text-gray-400 uppercase">
              Current: {btc(estimate?.currentBtc ?? balances.btc, 2)} BTC · Price {mxn(quote.btcPriceMxn)}
            </p>
          </div>
        </div>

        <div className="mb-8">
          <SectionTitle>Asset Alpha Comparison</SectionTitle>
          <div className="space-y-4">
            {ALPHA.map((a) => (
              <div key={a.label} className="flex items-center gap-4">
                <div className="w-12 text-[10px] font-bold text-gray-400">{a.label}</div>
                <div className="flex-grow bg-slate-100 h-6 rounded-full overflow-hidden">
                  <div className={`${a.color} h-full`} style={{ width: `${a.value}%` }} />
                </div>
                <div className="text-[10px] font-bold">{a.value > 0 ? `+${a.value}%` : `${a.value}%`}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-bold text-gray-400 mt-4 uppercase text-center italic">
            Based on 10-Year Average CAGR
          </p>
          {error && <p className="text-[10px] font-bold text-red-500 mt-2 uppercase text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
}
