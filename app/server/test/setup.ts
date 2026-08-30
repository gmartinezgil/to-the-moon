// Force all providers to their mock implementations and use an in-memory DB
// so tests are hermetic (no network, no files on disk).
process.env.DB_PATH = ':memory:';
process.env.PRICE_PROVIDER = 'mock';
process.env.ONCHAIN_PROVIDER = 'mock';
process.env.BANXICO_TOKEN = '';
process.env.BITSO_API_KEY = '';
process.env.BITSO_API_SECRET = '';
process.env.LN_HOST = '';
process.env.LN_API_KEY = '';
process.env.BITREFILL_API_KEY = '';
