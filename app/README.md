# To The Moon — App Implementation

Full-stack implementation of the To The Moon Bitcoin finance prototype.

## Layout

- `server/` — Fastify + TypeScript API. Owns all secrets, provider adapters, SQLite persistence.
- `web/` — Vite + React + Tailwind frontend (port of the demo prototype's 4 screens).

## Run

Requires Node 22.5+ (uses the built-in `node:sqlite` module).

```bash
npm install
npm run dev
```

- API: http://localhost:3001/api
- Web: http://localhost:5173 (proxies `/api` to the server)

## Tests

```bash
npm run test       # server unit + integration tests (vitest)
npm run typecheck  # both workspaces
npm run build      # production web build (includes PWA service worker)
```

The test suite runs against mock providers and an in-memory SQLite DB, so it is fully
hermetic and needs no credentials or network. See `server/test/`.

## Provider model

Every external integration sits behind a provider interface in `server/src/providers/` with
a mock implementation as the default. Live providers activate automatically when the matching
env var is present — no mocks or live code changes needed to wire a credential later.

| Provider | Interface | Live adapter | Env vars |
|---|---|---|---|
| BTC/MXN price | `PriceProvider` | Bitso (public), CoinGecko | `PRICE_PROVIDER` (`auto`\|`mock`\|`bitso`\|`coingecko`) |
| Inflation | `InflationProvider` | Banxico SIE | `BANXICO_TOKEN` |
| Buy/sell BTC | `ExchangeProvider` | Bitso Trading | `BITSO_API_KEY` + `BITSO_API_SECRET` |
| Lightning | `LightningProvider` | LNBits | `LN_HOST` + `LN_API_KEY` |
| Gift cards | `MarketplaceProvider` | Bitrefill | `BITREFILL_API_KEY` |
| Collateral loans | `LoanProvider` | — (partner/DeFi, stub) | — |
| On-chain wallet | `OnChainProvider` | Mempool.space | `ONCHAIN_PROVIDER` (`mock`\|`auto`\|`mempool`) |

The on-chain wallet is mock by default (simulated deposits via the Deposit button). Set
`ONCHAIN_PROVIDER=mempool` for a real mainnet wallet: the app derives a fresh BIP84 (P2WPKH)
address from a locally generated mnemonic, syncs balance/UTXOs, and signs/sweeps with a PSBT.

## API surface

All endpoints below are **authenticated** via `Authorization: Bearer <token>` (except health,
auth register/login, the public VAPID key, and the lightning webhook).

- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/push/vapid` (public), `POST /api/push/subscribe`
- `GET /api/price` — live quote + 30-day history
- `GET /api/wallet`, `POST /api/wallet/add|buy|sell`, `GET /api/wallet/deposit`
- `GET /api/wallet/onchain`, `POST /api/onchain/simulate-deposit`, `POST /api/onchain/send`
- `GET /api/ledger` — unified activity (Lightning + exchange + on-chain + marketplace)
- `GET /api/lightning`, `POST /api/lightning/invoices`, `GET /api/lightning/invoices/:paymentHash`,
  `POST /api/lightning/pay`, `POST /api/lightning/webhook`
- `GET /api/inflation`
- `POST /api/retirement/estimate`
- `GET /api/market/products`, `POST /api/market/purchase`
- `GET /api/loan/quote`
- `GET /api/dca`, `POST /api/dca` (accepts optional `frequency`: `daily`|`weekly`|`monthly`),
  `DELETE /api/dca/:id`, `GET /api/dca/growth` (cost basis vs. market value)
- `GET /api/taxes` — realized capital gains from trade history
- `GET /api/security` — on-chain UTXO audit + system health

Mutating routes (`wallet/add|buy|sell`, `onchain/send`, `lightning/pay`) accept an optional
`Idempotency-Key` header; replaying the same key+method+path+user returns the cached response so
double-spends never happen on network retries. Money actions are also recorded to an audit log
(`audit_log`).

See `docs/implementation-plan.md` in the repo root for the full feature map.

## Security

- **Authentication**: scrypt password hashing (per-user salt) + random bearer session tokens
  (stored hashed, 7-day expiry).
- **Encryption at rest**: the HD-wallet mnemonic is stored AES-256-GCM encrypted. The key comes
  from `WALLET_KEY` if set, else a `server/data/server.key` file generated on first boot. Legacy
  plaintext mnemonics migrate automatically.
- **Transport hardening**: `@fastify/helmet` (X-Frame-Options, nosniff, etc.), `@fastify/rate-limit`
  (300 req/min, drop idle sessions), `@fastify/cors` (locked down via `CORS_ORIGINS`), and a 1 MiB
  body cap.
- Production should run HTTPS (required for browser push) and set `WALLET_KEY`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## PWA & Push

The web app is a PWA: `vite-plugin-pwa` injects a manifest (`manifest.webmanifest`), an offline
service worker (precaches assets + SPA navigation fallback), and icons (`public/icon-*.png`). The
store will show "Add to Home Screen".

Push notifications report DCA executions and received Lightning payments. The server generates
VAPID keys on first boot (`server/data/vapid.json`) unless env vars are set. Push requires a secure
context (HTTPS or `localhost`).
