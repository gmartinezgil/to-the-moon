import type { AppContext } from '../context';
import { nowIso } from '../db';

export type DcaFrequency = 'daily' | 'weekly' | 'monthly';

const FREQUENCIES: DcaFrequency[] = ['daily', 'weekly', 'monthly'];

const FREQ_OFFSETS: Record<DcaFrequency, string> = {
  daily: '-1 day',
  weekly: '-7 days',
  monthly: '-1 month',
};

export function isDcaFrequency(value: unknown): value is DcaFrequency {
  return typeof value === 'string' && (FREQUENCIES as string[]).includes(value);
}

export function listSchedules(ctx: AppContext) {
  return ctx.db.prepare(
    'SELECT id, amount_fiat, frequency, enabled, last_run_at, created_at FROM dca_schedules ORDER BY id DESC',
  ).all();
}

export function createSchedule(ctx: AppContext, amountFiat: number, frequency: DcaFrequency = 'daily') {
  if (amountFiat <= 0) throw new Error('Amount must be positive');
  ctx.db.prepare(
    'INSERT INTO dca_schedules (amount_fiat, frequency, enabled, created_at) VALUES (?, ?, 1, ?)',
  ).run(amountFiat, frequency, nowIso());
  return listSchedules(ctx);
}

export function deleteSchedule(ctx: AppContext, id: number) {
  ctx.db.prepare('DELETE FROM dca_schedules WHERE id = ?').run(id);
}

export async function runDue(ctx: AppContext) {
  const schedules = ctx.db.prepare(
    'SELECT id, amount_fiat, frequency FROM dca_schedules WHERE enabled = 1',
  ).all() as { id: number; amount_fiat: number; frequency: string }[];

  const results: { id: number; status: string; detail?: string }[] = [];
  for (const schedule of schedules) {
    const offset = FREQ_OFFSETS[(schedule.frequency as DcaFrequency)] ?? FREQ_OFFSETS.daily;
    const due = ctx.db.prepare(
      'SELECT COUNT(*) AS n FROM dca_schedules WHERE id = ? AND (last_run_at IS NULL OR datetime(last_run_at) < datetime(?, ?))',
    ).get(schedule.id, new Date().toISOString(), offset) as { n: number };
    if (due.n === 0) continue;
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
