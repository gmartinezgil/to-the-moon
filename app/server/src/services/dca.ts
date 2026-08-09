import type { AppContext } from '../context';
import { nowIso } from '../db';

export function listSchedules(ctx: AppContext) {
  return ctx.db.prepare(
    'SELECT id, amount_fiat, frequency, enabled, last_run_at, created_at FROM dca_schedules ORDER BY id DESC',
  ).all();
}

export function createSchedule(ctx: AppContext, amountFiat: number) {
  if (amountFiat <= 0) throw new Error('Amount must be positive');
  ctx.db.prepare(
    'INSERT INTO dca_schedules (amount_fiat, frequency, enabled, created_at) VALUES (?, ?, 1, ?)',
  ).run(amountFiat, 'daily', nowIso());
  return listSchedules(ctx);
}

export function deleteSchedule(ctx: AppContext, id: number) {
  ctx.db.prepare('DELETE FROM dca_schedules WHERE id = ?').run(id);
}

export async function runDue(ctx: AppContext) {
  const due = ctx.db.prepare(
    'SELECT id, amount_fiat FROM dca_schedules WHERE enabled = 1 AND (last_run_at IS NULL OR datetime(last_run_at) < datetime(?, ?))',
  ).all(new Date().toISOString(), '-1 day') as { id: number; amount_fiat: number }[];

  const results: { id: number; status: string; detail?: string }[] = [];
  for (const schedule of due) {
    try {
      const { buyBtc } = await import('./wallet');
      const { btc } = await buyBtc(ctx, schedule.amount_fiat);
      ctx.db.prepare('UPDATE dca_schedules SET last_run_at = ? WHERE id = ?').run(nowIso(), schedule.id);
      results.push({ id: schedule.id, status: 'ok', detail: `bought ${btc.toFixed(8)} BTC` });
    } catch (err) {
      results.push({ id: schedule.id, status: 'error', detail: (err as Error).message });
    }
  }
  return results;
}
