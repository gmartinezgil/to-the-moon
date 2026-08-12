import { useEffect, useState } from 'react';
import { api, type DcaFrequency, type DcaSchedule, type LoanQuote, type PriceQuote, type SecurityReport, type TaxSummary } from '../api';
import { Modal, SectionTitle } from '../components/ui';
import { btc, mxn, sats } from '../format';

const FREQ_LABEL: Record<DcaFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

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
  const [dcaFreq, setDcaFreq] = useState<DcaFrequency>('daily');
  const [schedules, setSchedules] = useState<DcaSchedule[]>([]);
  const [dcaMsg, setDcaMsg] = useState('');

  const [toolModal, setToolModal] = useState<'taxes' | 'security' | null>(null);
  const [taxes, setTaxes] = useState<TaxSummary | null>(null);
  const [security, setSecurity] = useState<SecurityReport | null>(null);

  useEffect(() => {
    if (toolModal === 'taxes') api.taxes().then(setTaxes).catch(() => {});
    if (toolModal === 'security') api.security().then(setSecurity).catch(() => {});
  }, [toolModal]);

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
      const res = await api.createDca(n, dcaFreq);
      setSchedules(res.schedules);
      setDcaMsg(`${FREQ_LABEL[dcaFreq]} buy of ${mxn(n)} scheduled.`);
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
              Auto
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                value={dcaAmount}
                onChange={(e) => setDcaAmount(e.target.value)}
                placeholder="MXN per period"
                className="bg-white rounded-2xl px-4 py-3 font-extrabold text-xl outline-none w-full border border-slate-100"
              />
              <button
                onClick={addSchedule}
                className="bg-black text-[#FFDE3A] rounded-2xl px-6 font-black active:scale-95 transition-transform"
              >
                Add
              </button>
            </div>
            <div className="flex gap-2 mb-4">
              {(Object.keys(FREQ_LABEL) as DcaFrequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setDcaFreq(f)}
                  className={`flex-1 rounded-xl py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    dcaFreq === f
                      ? 'bg-black text-[#FFDE3A]'
                      : 'bg-white text-slate-400 border border-slate-100'
                  }`}
                >
                  {FREQ_LABEL[f]}
                </button>
              ))}
            </div>
            {dcaMsg && <p className="text-[10px] font-bold text-green-600 mb-2 uppercase">{dcaMsg}</p>}
            <div className="space-y-2">
              {schedules.length === 0 && (
                <p className="text-xs font-bold text-gray-400 uppercase">No active schedules</p>
              )}
              {schedules.map((s) => (
                <div key={s.id} className="flex justify-between items-center bg-white rounded-2xl px-4 py-3 border border-slate-100">
                  <div>
                    <span className="font-bold text-sm text-black">{mxn(s.amount_fiat)}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase ml-2">
                      / {FREQ_LABEL[s.frequency] ?? s.frequency}
                    </span>
                  </div>
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
            {TOOLS.map((t, i) => {
              const actionable = t.title === 'Taxes' || t.title === 'Security';
              return (
                <div
                  key={i}
                  onClick={actionable ? () => setToolModal(t.title === 'Taxes' ? 'taxes' : 'security') : undefined}
                  className={`bg-slate-50 border border-slate-100 rounded-3xl p-5 flex flex-col items-center gap-3 active:scale-95 transition-transform text-center ${actionable ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                >
                  <div className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-2xl text-black">
                    <i className={`fa-solid fa-${t.icon}`} />
                  </div>
                  <div>
                    <div className="font-bold text-black text-sm">{t.title}</div>
                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">{t.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {toolModal && (
        <Modal
          title={toolModal === 'taxes' ? 'Capital Gains Tax' : 'Wallet Security Audit'}
          subtitle={
            toolModal === 'taxes'
              ? 'Realized gains from your trade history.'
              : 'On-chain UTXO audit + system health.'
          }
          onClose={() => setToolModal(null)}
        >
          {toolModal === 'taxes' && taxes && (
            <div className="max-h-[420px] overflow-y-auto no-scrollbar">
              <div className="bg-black rounded-2xl p-4 mb-4 text-white">
                <p className="text-[10px] font-bold text-gray-400 uppercase">Realized Gain (avg cost)</p>
                <p className={`text-2xl font-black ${taxes.realizedGainMxn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {taxes.realizedGainMxn >= 0 ? '+' : ''}{mxn(taxes.realizedGainMxn)}
                </p>
                <p className="text-[10px] font-bold text-gray-400 mt-1">Avg cost basis: {mxn(taxes.avgCostMxn)} / BTC</p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Buys</p>
                  <p className="text-xl font-black text-black">{taxes.buys.count}</p>
                  <p className="text-[10px] font-bold text-slate-500">{btc(taxes.buys.btc, 6)} BTC</p>
                  <p className="text-[10px] font-bold text-slate-500">{mxn(taxes.buys.investedMxn)} invested</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Sells</p>
                  <p className="text-xl font-black text-black">{taxes.sells.count}</p>
                  <p className="text-[10px] font-bold text-slate-500">{btc(taxes.sells.btc, 6)} BTC</p>
                  <p className="text-[10px] font-bold text-slate-500">{mxn(taxes.sells.proceedsMxn)} proceeds</p>
                </div>
              </div>
              <div className="space-y-2">
                {taxes.trades.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <div>
                      <p className={`font-bold text-xs ${t.kind === 'buy' ? 'text-green-600' : 'text-red-500'}`}>
                        {t.kind === 'buy' ? 'BUY' : 'SELL'} · {btc(t.amountBtc, 6)} BTC
                      </p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <p className="text-xs font-bold text-slate-500">{mxn(t.amountFiat)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolModal === 'security' && security && (
            <div className="max-h-[420px] overflow-y-auto no-scrollbar">
              <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">UTXO Audit</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-black">{security.utxoCount} UTXOs</span>
                  <span className="text-lg font-black text-black">{sats(security.utxoTotalSats)} sats</span>
                </div>
                <div className="flex justify-between items-center mt-1 text-[10px] font-bold text-slate-400 uppercase">
                  <span>{security.provider}</span>
                  <span>{btc(security.utxoTotalSats / 100_000_000, 8)} BTC</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="bg-white rounded-xl p-2 text-center border border-slate-100">
                    <p className="text-xs font-black text-black">{sats(security.confirmedSats)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Confirmed</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 text-center border border-slate-100">
                    <p className="text-xs font-black text-black">{sats(security.unconfirmedSats)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Pending</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 text-center border border-slate-100">
                    <p className="text-xs font-black text-black">{sats(security.largestUtxoSats)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Largest</p>
                  </div>
                </div>
                <p className="text-[9px] text-gray-400 font-bold mt-3 break-all">{security.address}</p>
              </div>
              <div className="space-y-2">
                {security.checks.map((c) => (
                  <div key={c.label} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <div>
                      <p className="font-bold text-xs text-black">{c.label}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase">{c.detail}</p>
                    </div>
                    <span className={`text-lg ${c.ok ? 'text-green-500' : 'text-red-500'}`}>
                      <i className={`fa-solid ${c.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolModal && !(toolModal === 'taxes' ? taxes : security) && (
            <p className="text-center text-xs font-bold text-gray-400 uppercase py-6">Loading…</p>
          )}
        </Modal>
      )}
    </div>
  );
}
