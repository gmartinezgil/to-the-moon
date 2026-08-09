# Implementation Plan — Real Bitcoin for the To The Moon App

This plan maps every feature in the demo prototype (https://gmartinezgil.github.io/) to a real
Bitcoin implementation. The demo is a single self-contained React file with **all data
hardcoded** — no wallet, no APIs, no state persisted. This plan replaces every hardcoded value
with a live integration.

## Demo reality check

- BTC price is a constant (`1,325,400 MXN`); balances are seeded (`1.47 BTC`, `25,000 MXN`, `125,000 sats`)
- Charts, QR codes, and LN invoices are static/fake
- No network calls exist anywhere in the app
- MXN-centric (SPEI, Mexican institution "Aureo Bitcoin") — Mexico is the target market

## Recommended architecture

- **Frontend**: keep the React prototype (port to React Native/Expo later)
- **Backend**: TypeScript/Node (Fastify/Express) + Postgres via Prisma
- **Lightning**: LNBits (fastest to integrate, custodial) or LND/Core Lightning node, or a hosted
  provider (Voltage / Alby / Greenlight)
- **On-chain**: bitcoinjs-lib or BDK
- **Hosting**: single VPS/cloud VM; no keys in the frontend — all signed calls go through the backend

## Feature-by-feature integration

### Price & market data
| Demo | Real integration |
|---|---|
| Hardcoded `btcPrice` | Bitso public ticker `GET /api/v3/ticker?book=btc_mxn` (no auth required); CoinGecko as fallback |
| Static 30-day chart | Historical candles from Bitso trades / CoinGecko market-chart |
| Sats converter | Live price math from the same feed |

### Buy / Sell BTC
- Bitso **Trading API** (private, HMAC-SHA256 signed, API keys) — market buy/sell on `btc_mxn`
- Server executes the order, records the trade in Postgres, updates user balances
- Validation mirrors the demo (insufficient fiat/BTC), but checked against real balances

### Add fiat (SPEI)
- Hardest feature: requires KYC + a banking/PSP relationship to generate per-user SPEI CLABEs
  (as the demo's "Aureo Bitcoin" block implies)
- v1: rely on exchange deposit flows (e.g., Bitso SPEI deposit) or a MX fintech partner;
  keep the SPEI step as a manual/partner process

### DCA automation + reminder
- Backend cron (node-cron) places recurring buys per user schedule
- Notifications via push (Expo / OneSignal) replacing the demo's 60s fake timer
- DCA Growth chart rendered from real buy history in Postgres

### Inflation Shield
- Replace hardcoded "-35.4%" with real **Banxico SIE API** inflation (free 64-char token,
  `Bmx-Token` header; INPC series e.g. `SP74665`)
- Compare real peso erosion vs real BTC price appreciation over the same window

### FIRE Retirement Engine
- Keep the math: goal = `(monthlyExpenses × 12) × 25`, progress vs target, years to exit
- Feed it real balances (exchange + on-chain) and real BTC price instead of fixed values
- Asset Alpha Comparison can use published 10-year CAGR figures

### Lightning payments
- **Send**: pay real BOLT11 / LNURL invoices from the node; fee estimates via the LN graph/Mempool
- **Receive**: generate real BOLT11 invoices, render a real QR, watch the node for payment
- **Recent Activity**: unified ledger from node payment/invoice logs + on-chain txs + Bitrefill
  orders + exchange trades

### Bitrefill Market
- Bitrefill API v2 (`https://api.bitrefill.com/v2`): personal API key, Bearer auth
- Create invoice with `payment_method: lightning`, pay from our LN node, receive webhook,
  deliver the gift-card redemption code to the user; implement "cashback" as discount logic

### Ledn Collateral Loan
- Ledn has **no public self-serve API**. Options:
  1. Ledn partner program (business negotiation)
  2. DeFi BTC lending (e.g., Debit protocol, Sovryn on Rootstock)
  3. Real on-chain collateral custody + internal loan book
- The LTV calculator itself can go live immediately using the real price feed

### Directory tools
- **Taxes**: realized capital-gains computed from real trade history (Mexican rules)
- **Security**: real on-chain UTXO audit + node health status
- **Savings**: yield via lending partners (APY shown from partner data)
- **Daily spend / debt freedom**: sats converter + collateral loan plumbing above

## Delivery phases

1. **Phase 0** — backend skeleton, Postgres schema, live price feed, charts
2. **Phase 1** — on-chain wallet, deposit addresses, real balances
3. **Phase 2** — Bitso buy/sell + SPEI deposit + DCA cron
4. **Phase 3** — Lightning node, send/receive, activity ledger
5. **Phase 4** — Bitrefill + Ledn integrations
6. **Phase 5** — Retirement engine + inflation shield on real data, directory tools

## Security

- All API keys/env secrets server-side only
- Hot Lightning node + cold wallet separation; watchtower / SCB backups
- Validate every invoice server-side before paying
- KYC/AML awareness for SPEI and exchange integrations
