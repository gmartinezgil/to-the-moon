export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  dbPath: process.env.DB_PATH ?? new URL('../data/app.db', import.meta.url).pathname,
  priceProvider: (process.env.PRICE_PROVIDER ?? 'auto') as 'auto' | 'mock' | 'bitso' | 'coingecko',
  onchainProvider: (process.env.ONCHAIN_PROVIDER ?? 'mock') as 'auto' | 'mock' | 'mempool',
  banxicoToken: process.env.BANXICO_TOKEN ?? '',
  bitsoApiKey: process.env.BITSO_API_KEY ?? '',
  bitsoApiSecret: process.env.BITSO_API_SECRET ?? '',
  lnHost: process.env.LN_HOST ?? '',
  lnApiKey: process.env.LN_API_KEY ?? '',
  bitrefillApiKey: process.env.BITREFILL_API_KEY ?? '',
  dcaIntervalMs: Number(process.env.DCA_INTERVAL_MS ?? 30000),
  mockSeedPrice: Number(process.env.MOCK_SEED_PRICE ?? 1325400),
  // Comma-separated allowed CORS origins, e.g. "http://localhost:5173". Empty → same-origin.
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // Auth tuning.
  cookieSecure: process.env.COOKIE_SECURE === '1',
  authMinPasswordLength: Number(process.env.AUTH_MIN_PASSWORD_LENGTH ?? 10),
  authMaxLoginAttempts: Number(process.env.AUTH_MAX_LOGIN_ATTEMPTS ?? 5),
  authLockoutMs: Number(process.env.AUTH_LOCKOUT_MS ?? 15 * 60 * 1000),
  authFailureWindowMs: Number(process.env.AUTH_FAILURE_WINDOW_MS ?? 15 * 60 * 1000),
  authSessionTtlMs: Number(process.env.AUTH_SESSION_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
  authMaxSessionsPerUser: Number(process.env.AUTH_MAX_SESSIONS_PER_USER ?? 10),
  // When true (default), the forgot-password response includes the reset token so the
  // reset flow works before an email provider is wired. Set to '0' in production.
  authExposeResetToken: process.env.AUTH_EXPOSE_RESET_TOKEN !== '0',
} as const;
