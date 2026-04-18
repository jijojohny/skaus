import 'dotenv/config';

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  port: parseInt(
    process.env.RELAYER_PORT || process.env.PORT || '3002',
    10,
  ),
  nodeEnv,
  logLevel:
    process.env.LOG_LEVEL ||
    (nodeEnv === 'production' ? 'warn' : 'info'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:4000').split(','),

  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'http://localhost:8899',
    stealthPoolProgramId: process.env.STEALTH_POOL_PROGRAM_ID || 'EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq',
    // Timeout for individual RPC HTTP fetches (ms)
    rpcFetchTimeoutMs: parseInt(process.env.SOLANA_RPC_FETCH_TIMEOUT_MS || '10000', 10),
  },

  relayer: {
    privateKey: process.env.RELAYER_PRIVATE_KEY || '',
    feeBps: parseInt(process.env.RELAYER_FEE_BPS || '10', 10),
    maxConcurrent: parseInt(process.env.RELAYER_MAX_CONCURRENT || '2', 10),
    maxAttempts: parseInt(process.env.RELAYER_MAX_ATTEMPTS || '3', 10),
    pollIntervalMs: parseInt(process.env.RELAYER_POLL_INTERVAL_MS || '10000', 10),
    // Timeout for individual DB queries inside the poll loop (ms)
    dbQueryTimeoutMs: parseInt(process.env.RELAYER_DB_QUERY_TIMEOUT_MS || '8000', 10),
  },
} as const;
