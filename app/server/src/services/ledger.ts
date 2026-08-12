import type { AppContext } from '../context';
import { getTransactions } from './wallet';
import { ensureAddress } from './onchain';

export type LedgerSource = 'lightning' | 'exchange' | 'onchain' | 'market';

export interface LedgerItem {
  id: string;
  source: LedgerSource;
  direction: 'in' | 'out';
  amountSats?: number;
  amountBtc?: number;
  amountFiat?: number;
  memo: string;
  createdAt: string;
}

function kindToMemo(kind: string, meta: string): string {
  try {
    const parsed = JSON.parse(meta) as { orderId?: string; provider?: string };
    if (kind === 'add_fiat') return 'SPEI deposit';
    if (kind === 'buy') return `Buy BTC${parsed.orderId ? ` · ${parsed.orderId}` : ''}`;
    if (kind === 'sell') return `Sell BTC${parsed.orderId ? ` · ${parsed.orderId}` : ''}`;
    if (parsed.orderId) return `Order ${parsed.orderId}`;
  } catch {
    /* ignore malformed meta */
  }
  return kind;
}

export async function getLedger(ctx: AppContext, limit = 40): Promise<LedgerItem[]> {
  const items: LedgerItem[] = [];

  // Lightning activity
  try {
    const activity = await ctx.lightning.getActivity();
    for (const a of activity) {
      items.push({
        id: `ln-${items.length}-${a.createdAt}`,
        source: 'lightning',
        direction: a.direction,
        amountSats: a.amountSats,
        memo: a.memo || 'Lightning payment',
        createdAt: a.createdAt,
      });
    }
  } catch (err) {
    console.warn('[ledger] lightning activity failed:', (err as Error).message);
  }

  // Exchange trades + fiat adds (transactions table)
  const txns = getTransactions(ctx, 100) as unknown as {
    id: number; kind: string; amount_fiat: number; amount_btc: number; amount_sats: number; meta: string; created_at: string;
  }[];
  for (const t of txns) {
    const direction: 'in' | 'out' = t.kind === 'buy' || t.kind === 'sell'
      ? t.kind === 'buy' ? 'out' : 'in'
      : t.kind === 'add_fiat' ? 'in' : 'out';
    items.push({
      id: `ex-${t.id}`,
      source: 'exchange',
      direction,
      amountSats: t.amount_sats || undefined,
      amountBtc: t.amount_btc || undefined,
      amountFiat: t.amount_fiat || undefined,
      memo: kindToMemo(t.kind, t.meta),
      createdAt: t.created_at,
    });
  }

  // On-chain transactions
  try {
    const info = await ensureAddress(ctx);
    const txns = await ctx.onchain.getTransactions(info.address);
    for (const tx of txns) {
      items.push({
        id: `oc-${tx.txid}-${tx.blocktime}`,
        source: 'onchain',
        direction: tx.direction,
        amountSats: tx.valueSats,
        memo: tx.direction === 'in' ? 'On-chain deposit' : 'On-chain withdrawal',
        createdAt: new Date(tx.blocktime * 1000).toISOString(),
      });
    }
  } catch (err) {
    console.warn('[ledger] onchain activity failed:', (err as Error).message);
  }

  // Marketplace orders
  const orders = ctx.db.prepare(
    'SELECT id, product_name, amount_fiat, status, redemption_code, created_at FROM market_orders ORDER BY id DESC LIMIT 50',
  ).all() as {
    id: number; product_name: string; amount_fiat: number; status: string; redemption_code: string | null; created_at: string;
  }[];
  for (const o of orders) {
    items.push({
      id: `mk-${o.id}`,
      source: 'market',
      direction: 'out',
      amountFiat: o.amount_fiat,
      memo: `${o.product_name} gift card${o.redemption_code ? ` · ${o.redemption_code}` : ''} (${o.status})`,
      createdAt: o.created_at,
    });
  }

  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
