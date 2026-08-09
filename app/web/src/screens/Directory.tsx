import { useEffect, useState } from 'react';
import { api, type DcaSchedule, type LoanQuote, type PriceQuote } from '../api';
import { SectionTitle } from '../components/ui';
import { mxn, sats } from '../format';

const TOOLS = [
  { title: 'Banking Alts', icon: 'building-columns', desc: 'APY & Yields' },
  { title: 'Daily Spend', icon: 'mug-hot', desc: 'Sats Converters' },
  { title: 'Debt Freedom', icon: 'credit-card', desc: 'Collateral Loans' },
  { title: 'Savings', icon: 'piggy-bank', desc: 'DCA Planners' },
  { title: 'Security', icon: 'shield-halved', desc: 'Wallet Audits' },
  { title: 'Taxes', icon: 'scale-balanced', desc: 'Capital Gains' },
];

export default function Directory({ quote }: { quote: PriceQuote }) {
  const [loanBtc, setLoanBtc] = useState('0.5');
  const [loan, setLoan] = useState<LoanQuote | null>(null);

  const [fiatToSats, setFiatToSats] = useState('10000');

  const [dcaAmount, setDcaAmount] = useState('500');
  const [schedules, setSchedules] = useState<DcaSchedule[]>([]);
  const [dcaMsg, setDcaMsg] = useState('');

  useEffect(() => {
    const n = Number(loanBtc);
    if (!Number.isFinite(n) || n <= 0) return;
    const timer = setTimeout(() => {
      api.loanQuote(n).then((res) => setLoan(res.loan)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [loanBtc]);

  useEffect(() => {
    api.dca().then((r) => setSchedules(r.schedules)).catch(() => {});
  }, []);

  const addSchedule = async () => {
    const n = Number(dcaAmount);
    if (!Number.isFinite(n) || n <= 0) return setDcaMsg('Enter a valid amount');
    setDcaMsg('');
    try {
      const res = await api.createDca(n);
      setSchedules(res.schedules);
      setDcaMsg(`Daily buy of ${mxn(n)} scheduled.`);
    } catch (err) {
      setDcaMsg((err as Error).message);
    }
  };

  const removeSchedule = async (id: number) => {
    await api.deleteDca(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  const fiatNum = Number(fiatToSats);
  const satsAmount = Number.isFinite(fiatNum) && fiatNum > 0 ? Math.floor((fiatNum / quote.btcPriceMxn) * 100_000_000) : 0;

  return (
    <div className="animate-fadeInFast h-full bg-black">
      <div className="p-6 pt-12 h-[240px]">
        <div className="comfortaa text-[36px] font-bold mt-4 leading-none text-[#FFDE3A]">Financial Engines</div>
        <p className="font-medium mt-2 text-gray-400">Tools for sovereign wealth.</p>
      </div>

      <div className="bottom-sheet no-scrollbar pb-32" style={{ top: 190 }}>
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <SectionTitle>Ledn Collateral Loan</SectionTitle>
            <span className="text-[#FFDE3A] font-bold bg-black px-3 py-1 rounded-full text-[10px] uppercase tracking-widest">
              {loan?.ltvPct ?? 50}% LTV
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              Collateral (BTC)
            </label>
            <div className="flex items-center bg-white rounded-2xl px-4 py-3 mb-4 shadow-sm border border-slate-100">
              <span className="font-black text-slate-400 mr-2">₿</span>
              <input
                type="number"
                value={loanBtc}
                onChange={(e) => setLoanBtc(e.target.value)}
                className="bg-transparent font-extrabold text-xl outline-none w-full text-black"
              />
            </div>
            <div className="bg-black rounded-2xl p-4 flex justify-between items-center text-white">
              <span className="text-xs font-bold text-gray-400">Available Loan</span>
              <span className="text-xl font-black text-[#FFDE3A]">{loan ? mxn(loan.availableMxn) : '—'}</span>
            </div>
            <button className="w-full bg-[#FFDE3A] text-black border-2 border-[#FFDE3A] rounded-2xl py-3 mt-3 font-black text-sm active:scale-95 transition-transform shadow-sm">
              Request Credit via Ledn
            </button>
            {loan && <p className="text-[9px] text-gray-400 font-bold mt-2 text-center uppercase">{loan.terms}</p>}
          </div>
        </div>

        <div className="mb-8">
          <SectionTitle>Sats Converter</SectionTitle>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              Amount (MXN)
            </label>
            <div className="flex items-center bg-white rounded-2xl px-4 py-3 mb-4 shadow-sm border border-slate-100">
              <span className="font-black text-slate-400 mr-2">$</span>
              <input
                type="number"
                value={fiatToSats}
                onChange={(e) => setFiatToSats(e.target.value)}
                className="bg-transparent font-extrabold text-xl outline-none w-full text-black"
              />
            </div>
            <div className="absolute top-[70px] left-1/2 -ml-5 w-10 h-10 bg-black rounded-full flex items-center justify-center text-[#FFDE3A] border-4 border-white shadow-sm z-10">
              <i className="fa-solid fa-arrow-down" />
            </div>
            <div className="bg-slate-200 rounded-2xl p-4 flex justify-between items-center mt-2">
              <span className="text-xl font-black text-black">{sats(satsAmount)}</span>
              <span className="text-xs font-bold text-slate-500">SATS @ {mxn(quote.btcPriceMxn)}/BTC</span>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <SectionTitle>DCA Auto-Stack</SectionTitle>
            <span className="text-[#FFDE3A] font-bold bg-black px-3 py-1 rounded-full text-[10px] uppercase tracking-widest">
              Daily
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                value={dcaAmount}
                onChange={(e) => setDcaAmount(e.target.value)}
                placeholder="MXN per day"
                className="bg-white rounded-2xl px-4 py-3 font-extrabold text-xl outline-none w-full border border-slate-100"
              />
              <button
                onClick={addSchedule}
                className="bg-black text-[#FFDE3A] rounded-2xl px-6 font-black active:scale-95 transition-transform"
              >
                Add
              </button>
            </div>
            {dcaMsg && <p className="text-[10px] font-bold text-green-600 mb-2 uppercase">{dcaMsg}</p>}
            <div className="space-y-2">
              {schedules.length === 0 && (
                <p className="text-xs font-bold text-gray-400 uppercase">No active schedules</p>
              )}
              {schedules.map((s) => (
                <div key={s.id} className="flex justify-between items-center bg-white rounded-2xl px-4 py-3 border border-slate-100">
                  <span className="font-bold text-sm text-black">{mxn(s.amount_fiat)} / day</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">
                      {s.last_run_at ? 'last: ' + new Date(s.last_run_at).toLocaleDateString() : 'starting'}
                    </span>
                    <button
                      onClick={() => removeSchedule(s.id)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <SectionTitle>Full Directory</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            {TOOLS.map((t, i) => (
              <div
                key={i}
                className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex flex-col items-center gap-3 active:scale-95 transition-transform cursor-pointer hover:bg-slate-100 text-center"
              >
                <div className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-2xl text-black">
                  <i className={`fa-solid fa-${t.icon}`} />
                </div>
                <div>
                  <div className="font-bold text-black text-sm">{t.title}</div>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
