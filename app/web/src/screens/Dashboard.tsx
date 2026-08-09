import { useEffect, useState } from 'react';
import { api, type Balances, type PricePoint, type PriceQuote } from '../api';
import { AmountInput, BigButton, Modal, Pill, SectionTitle } from '../components/ui';
import { Sparkline } from '../components/Sparkline';
import { btc, mxn } from '../format';

type ModalType = 'add' | 'buy' | 'sell' | null;

export default function Dashboard({
  quote,
  history,
  balances,
  onChanged,
}: {
  quote: PriceQuote;
  history: PricePoint[];
  balances: Balances;
  onChanged: () => void;
}) {
  const [modalType, setModalType] = useState<ModalType>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [inflation, setInflation] = useState<{ annualRatePct: number; source: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowReminder(true), 30000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    api.inflation().then(setInflation).catch(() => {});
  }, []);

  const submit = async () => {
    const val = Number(amount);
    if (!Number.isFinite(val) || val <= 0) return setError('Valid amount required.');
    if (modalType === 'buy' && val > balances.fiatMxn) return setError('Insufficient fiat.');
    if (modalType === 'sell' && val > balances.btc) return setError('Insufficient BTC.');
    setBusy(true);
    setError('');
    try {
      if (modalType === 'add') await api.addFiat(val);
      if (modalType === 'buy') await api.buy(val);
      if (modalType === 'sell') await api.sell(val);
      setModalType(null);
      setAmount('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const trendPct = history.length >= 2 ? ((history[history.length - 1].p - history[0].p) / history[0].p) * 100 : quote.change24hPct;

  return (
    <div className="animate-fadeInFast relative h-full">
      {showReminder && (
        <div className="absolute top-10 left-4 right-4 bg-black border-2 border-[#FFDE3A] rounded-[24px] p-4 z-[90] shadow-2xl animate-slideDown">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-[#FFDE3A] rounded-full flex items-center justify-center text-black font-bold mr-3">
                <i className="fa-solid fa-clock-rotate-left" />
              </div>
              <div>
                <p className="text-white font-extrabold text-sm leading-tight">DCA Reminder</p>
                <p className="text-gray-400 text-xs mt-0.5">Time for your daily stack!</p>
              </div>
            </div>
            <button onClick={() => setShowReminder(false)} className="text-gray-500 hover:text-white">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <button
            onClick={() => {
              setShowReminder(false);
              setModalType('buy');
            }}
            className="w-full bg-[#FFDE3A] text-black rounded-xl py-2 font-black text-sm"
          >
            Buy Bitcoin Now
          </button>
        </div>
      )}

      <div className="p-6 pt-12 h-[350px]">
        <div className="flex justify-between items-center">
          <Pill>{btc(balances.btc, 4)} BTC ▼</Pill>
          <Pill onClick={() => setModalType('add')}>
            Add fiat <i className="fa-solid fa-plus ml-1" />
          </Pill>
        </div>
        <div className="mt-8 mb-1 flex justify-between items-end">
          <span className="text-[10px] font-black text-gray-800 uppercase">Total Wealth</span>
          <span className="text-[10px] font-bold bg-black text-[#FFDE3A] px-2 py-1 rounded-md">
            Cash: {mxn(balances.fiatMxn)}
          </span>
        </div>
        <div className="comfortaa text-[36px] font-bold text-black tracking-tighter mb-8 leading-none">
          {mxn(balances.totalMxn, 2)}
        </div>

        <div className="flex justify-between gap-3 mt-8">
          <div
            onClick={() => setModalType('buy')}
            className="bg-black text-[#FFDE3A] rounded-full px-6 py-4 flex-1 font-black text-center cursor-pointer shadow-lg active:scale-95 transition-transform"
          >
            Buy BTC
          </div>
          <div
            onClick={() => setModalType('sell')}
            className="bg-white text-black border-2 border-black rounded-full px-6 py-4 flex-1 font-black text-center cursor-pointer active:scale-95 transition-transform"
          >
            Sell BTC
          </div>
        </div>
      </div>

      <div className="bottom-sheet no-scrollbar pb-32">
        <div className="flex items-center justify-between mb-8 bg-slate-50 p-4 rounded-3xl border border-slate-100">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-[#FFDE3A] text-xl">
              <i className="fa-brands fa-bitcoin" />
            </div>
            <div className="ml-4">
              <p className="font-extrabold text-lg text-black leading-none">Bitcoin</p>
              <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">{btc(balances.btc)} BTC</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-extrabold text-lg text-black">{mxn(balances.btc * quote.btcPriceMxn)}</p>
            <p className="text-xs font-bold text-green-500 mt-1">1 BTC = {mxn(quote.btcPriceMxn)}</p>
          </div>
        </div>

        <div className="mb-8">
          <SectionTitle>DCA Growth</SectionTitle>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 relative overflow-hidden">
            <Sparkline points={history.map((h) => h.p)} color="#FFDE3A" height={80} />
            <div className="relative z-10">
              <p className="text-2xl font-black text-black">{btc(balances.btc, 4)} BTC</p>
              <p className="text-xs font-bold text-green-600">+ Active Stacking</p>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <SectionTitle>Inflation Shield</SectionTitle>
          <div className="bg-black rounded-3xl p-5">
            <div className="mb-4">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">
                BTC Balance
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full">
                <div className="bg-[#FFDE3A] h-full w-full rounded-full" />
              </div>
              <div className="text-[#FFDE3A] text-right mt-1.5 font-bold text-xs">100% Retained</div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">
                Cash (Erosion)
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full">
                <div className="bg-red-500 h-[65%] rounded-full" />
              </div>
              <div className="text-red-400 text-right mt-1.5 font-bold text-xs">
                -{inflation ? Math.max(1, inflation.annualRatePct * 3).toFixed(1) : 13.5}% 3Y Loss
                {inflation && <span className="text-slate-500 ml-1">({inflation.source})</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-end mb-4">
            <SectionTitle>30-Day Trend</SectionTitle>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              BTC / MXN · {quote.source}
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 relative overflow-hidden">
            <div className="flex justify-between items-center mb-4 relative z-10">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Current Price</p>
                <p className="text-xl font-black text-black">
                  {mxn(quote.btcPriceMxn)} <span className="text-xs text-gray-400">/ BTC</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase">30D Change</p>
                <p className={`text-sm font-bold ${trendPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {trendPct >= 0 ? '+' : ''}
                  {trendPct.toFixed(1)}%
                </p>
              </div>
            </div>
            <Sparkline points={history.map((h) => h.p)} height={80} />
          </div>
        </div>
      </div>

      {modalType && (
        <Modal
          title={modalType === 'add' ? 'Add Funds' : modalType === 'buy' ? 'Buy Bitcoin' : 'Sell Bitcoin'}
          subtitle={
            modalType === 'add' ? undefined : modalType === 'buy' ? 'Convert fiat to BTC.' : 'Convert BTC to fiat.'
          }
          onClose={() => setModalType(null)}
        >
          {modalType === 'add' && (
            <div className="bg-slate-50 p-4 rounded-2xl mt-4 mb-4 text-center border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Transfer via SPEI</p>
              <p className="text-lg font-black text-black tracking-widest mb-1">646 180 1234567890 1</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Institution: Aureo Bitcoin</p>
            </div>
          )}
          {modalType !== 'add' && (
            <p className="text-right mb-1">
              <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-md uppercase">
                {modalType === 'buy'
                  ? `Available: ${mxn(balances.fiatMxn)}`
                  : `Available: ${btc(balances.btc)} BTC`}
              </span>
            </p>
          )}
          <AmountInput
            prefix={modalType === 'sell' ? '₿' : '$'}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setError('');
            }}
            autoFocus
          />
          <p className="text-[10px] font-bold text-red-500 uppercase px-2 mb-6 h-3">{error}</p>
          <BigButton onClick={submit} disabled={busy}>
            {busy ? 'Working…' : 'Confirm'}
          </BigButton>
        </Modal>
      )}
    </div>
  );
}
