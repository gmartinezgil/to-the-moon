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

See `docs/implementation-plan.md` in the repo root for the full feature map.
