import { useEffect, useState } from 'react';
import { api, type LightningData, type LightningInvoice, type MarketProduct, type PriceQuote } from '../api';
import { AmountInput, BigButton, Modal, Pill, SectionTitle } from '../components/ui';
import { mxn, sats } from '../format';

export default function Payments({ quote }: { quote: PriceQuote }) {
  const [lightning, setLightning] = useState<LightningData | null>(null);
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [modal, setModal] = useState<'send' | 'receive' | null>(null);
  const [bolt11, setBolt11] = useState('');
  const [satsAmount, setSatsAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<LightningInvoice | null>(null);

  const refresh = () => {
    api.lightning().then(setLightning).catch(() => {});
    api.marketProducts().then((r) => setProducts(r.products)).catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  const send = async () => {
    const amount = satsAmount === '' ? undefined : Number(satsAmount);
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return setError('Invalid sats amount');
    if (bolt11.length < 20) return setError('Enter a valid bolt11 invoice');
    setBusy(true);
    setError('');
    try {
      const res = await api.payInvoice(bolt11, amount);
      setBolt11('');
      setSatsAmount('');
      setModal(null);
      refresh();
      alert(`Paid! fee: ${res.feeSats} sats`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const receive = async () => {
    const amount = Number(satsAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter sats to receive');
    setBusy(true);
    setError('');
    try {
      const res = await api.createInvoice(amount, 'Receive via LN');
      setInvoice(res.invoice);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const purchase = async (product: MarketProduct) => {
    const amount = Number(satsAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter amount in sats');
    setBusy(true);
    setError('');
    try {
      const valueMxn = (amount / 100_000_000) * quote.btcPriceMxn;
      const res = await api.marketPurchase(product.id, valueMxn);
      alert(`${product.name}: code ${res.order.redemptionCode}`);
      setSatsAmount('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fiatEq = lightning ? lightning.fiatEquivalentMxn : 0;

  return (
    <div className="animate-fadeInFast relative h-full">
      <div className="p-6 pt-12 h-[350px]">
        <div className="flex justify-between items-center">
          <Pill dark>
            Lightning Network <i className="fa-solid fa-bolt text-[#FFDE3A] ml-1" />
          </Pill>
          <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-[#FFDE3A] text-lg shadow-sm">
            <i className="fa-solid fa-qrcode" />
          </div>
        </div>
        <div className="mt-12 text-black">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Spending Balance</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="comfortaa text-[44px] font-bold tracking-tighter text-black">
              {lightning ? sats(lightning.balanceSats) : '—'}
            </p>
            <p className="font-bold text-xl text-black">sats</p>
          </div>
          <p className="text-xs font-bold mt-1 opacity-70">≈ {mxn(fiatEq, 2)}</p>
        </div>

        <div className="flex gap-3 mt-4">
          <div
            onClick={() => {
              setModal('send');
              setSatsAmount('');
              setBolt11('');
            }}
            className="bg-black text-[#FFDE3A] px-5 py-4 rounded-full font-black flex-1 text-center cursor-pointer active:scale-95 transition-transform shadow-lg"
          >
            Send
          </div>
          <div
            onClick={() => {
              setModal('receive');
              setSatsAmount('');
            }}
            className="bg-white text-black border-2 border-black px-5 py-4 rounded-full font-black flex-1 text-center cursor-pointer active:scale-95 transition-transform"
          >
            Receive
          </div>
        </div>
      </div>

      <div className="bottom-sheet no-scrollbar pb-32">
        <div className="mb-10">
          <SectionTitle>Recent Activity</SectionTitle>
          <div className="flex flex-col gap-4">
            {(lightning?.activity ?? []).map((tx, i) => {
              const incoming = tx.direction === 'in';
              return (
                <div key={i} className="flex justify-between items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 ${incoming ? 'bg-green-100 text-green-500' : 'bg-red-100 text-red-500'} rounded-full flex items-center justify-center`}
                    >
                      <i className={`fa-solid ${incoming ? 'fa-arrow-down' : 'fa-arrow-up'}`} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-black">{tx.memo || 'Lightning tx'}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${incoming ? 'text-green-500' : 'text-black'}`}>
                      {incoming ? '+' : '-'}{sats(tx.amountSats)} sats
                    </p>
                    <p className="text-[10px] text-gray-400 font-bold">
                      {incoming ? '+' : '-'}{mxn((tx.amountSats / 100_000_000) * quote.btcPriceMxn, 2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-6">
            <SectionTitle>Bitrefill Market</SectionTitle>
            <span className="text-[#FFDE3A] font-bold bg-black px-3 py-1 rounded-full text-[10px] uppercase tracking-widest">
              10% Cashback
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {products.map((p) => (
              <div
                key={p.id}
                onClick={() => purchase(p)}
                className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex flex-col items-center gap-3 active:scale-95 transition-transform cursor-pointer hover:bg-slate-100"
              >
                <div className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-2xl text-black">
                  <i className={`fa-solid fa-${p.icon}`} />
                </div>
                <p className="font-bold text-sm text-black">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal === 'receive' ? 'Receive Bitcoin' : 'Send Bitcoin'}
          subtitle={modal === 'receive' ? 'Lightning or On-Chain' : 'Enter address or scan QR.'}
          onClose={() => setModal(null)}
        >
          {modal === 'receive' ? (
            <div className="text-center">
              <div className="bg-white p-4 inline-block rounded-3xl border-4 border-black mb-4 mt-2">
                <i className="fa-solid fa-qrcode text-[120px] text-black" />
              </div>
              <AmountInput prefix="⚡" value={satsAmount} onChange={setSatsAmount} placeholder="sats" />
              {invoice ? (
                <div className="bg-slate-100 p-3 rounded-xl mb-6 mt-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Invoice</p>
                  <p className="text-[11px] font-bold text-black break-all">{invoice.invoice}</p>
                </div>
              ) : (
                <p className="text-[10px] font-bold text-red-500 uppercase px-2 mb-6 h-3">{error}</p>
              )}
              <BigButton onClick={receive} disabled={busy}>
                {busy ? 'Creating…' : 'Create Invoice'}
              </BigButton>
            </div>
          ) : (
            <div>
              <div className="bg-slate-100 rounded-2xl p-4 flex items-center mb-4">
                <input
                  type="text"
                  value={bolt11}
                  onChange={(e) => setBolt11(e.target.value)}
                  placeholder="bc1q... or LN invoice"
                  className="bg-transparent text-sm font-bold text-black outline-none w-full"
                  autoFocus
                />
                <i className="fa-solid fa-qrcode text-xl text-black ml-2 cursor-pointer" />
              </div>
              <div className="bg-slate-100 rounded-2xl p-4 flex items-center mb-2">
                <span className="font-black text-xl text-slate-400 mr-2">sats</span>
                <input
                  type="number"
                  value={satsAmount}
                  onChange={(e) => setSatsAmount(e.target.value)}
                  placeholder="0"
                  className="bg-transparent text-3xl font-extrabold text-black outline-none w-full"
                />
              </div>
              <p className="text-[10px] font-bold text-red-500 uppercase px-2 mb-6 h-3">{error}</p>
              <BigButton onClick={send} variant="yellow" disabled={busy}>
                {busy ? 'Paying…' : 'Confirm Send'}
              </BigButton>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
