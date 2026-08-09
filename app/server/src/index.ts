import Fastify from 'fastify';
import { config } from './config';
import { createContext } from './context';
import { registerRoutes } from './routes';
import { runDue } from './services/dca';

async function main() {
  const ctx = createContext();
  const app = Fastify({ logger: true });

  registerRoutes(app, ctx);

  await app.listen({ port: config.port, host: config.host });
  console.log(`\n[to-the-moon] API ready at http://${config.host}:${config.port}/api`);
  console.log(`[to-the-moon] price provider: ${ctx.price.name}`);
  console.log(`[to-the-moon] inflation provider: ${ctx.inflation.name}`);
  console.log(`[to-the-moon] exchange provider: ${ctx.exchange.name}`);
  console.log(`[to-the-moon] lightning provider: ${ctx.lightning.name}`);
  console.log(`[to-the-moon] marketplace provider: ${ctx.market.name}\n`);

  setInterval(() => {
    runDue(ctx)
      .then((results) => {
        if (results.length) console.log('[dca] ran:', results);
      })
      .catch((err) => console.error('[dca] error:', err));
  }, config.dcaIntervalMs);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
