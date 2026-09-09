import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { createContext } from './context';
import { registerRoutes } from './routes';
import { runDue } from './services/dca';
import { syncOnchain } from './services/onchain';
import { sendPush } from './push';
import { cleanupExpiredSessions } from './auth';

async function main() {
  const ctx = createContext();
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 }); // 1 MiB request body cap

  await app.register(helmet, {
    contentSecurityPolicy: false, // Vite dev + inline styles from the UI
    crossOriginEmbedderPolicy: false,
  });
  // CORS: same-origin by default; when origins are configured, allow credentialed
  // cookie-based auth from those exact origins.
  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: config.corsOrigins.length > 0,
  });
  // Throttle API abuse; the global limit covers auth brute-force too.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });

  await registerRoutes(app, ctx);

  await app.listen({ port: config.port, host: config.host });
  console.log(`\n[to-the-moon] API ready at http://${config.host}:${config.port}/api`);
  console.log(`[to-the-moon] price provider: ${ctx.price.name}`);
  console.log(`[to-the-moon] inflation provider: ${ctx.inflation.name}`);
  console.log(`[to-the-moon] exchange provider: ${ctx.exchange.name}`);
  console.log(`[to-the-moon] lightning provider: ${ctx.lightning.name}`);
  console.log(`[to-the-moon] marketplace provider: ${ctx.market.name}`);
  console.log(`[to-the-moon] onchain provider: ${ctx.onchain.name}\n`);

  // Warm the on-chain wallet (derives the receive address, queries balance).
  syncOnchain(ctx)
    .then((s) => console.log(`[onchain] synced ${s.address} — ${(s.balanceSats / 1e8).toFixed(8)} BTC`))
    .catch((err) => console.warn('[onchain] initial sync failed:', (err as Error).message));

  setInterval(() => {
    runDue(ctx)
      .then((results) => {
        if (results.length) {
          console.log('[dca] ran:', results);
          sendPush(ctx.db, 'DCA executed', `${results.filter((r) => r.status === 'ok').length} scheduled buy(s) completed.`);
        }
      })
      .catch((err) => console.error('[dca] error:', err));
  }, config.dcaIntervalMs);

  // Daily janitor: drop expired sessions.
  setInterval(() => cleanupExpiredSessions(ctx.db), 24 * 60 * 60 * 1000);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
