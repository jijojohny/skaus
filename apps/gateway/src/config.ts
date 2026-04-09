import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),

  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'http://localhost:8899',
    cluster: (process.env.SOLANA_CLUSTER || 'localnet') as 'mainnet-beta' | 'devnet' | 'localnet',
    stealthPoolProgramId: process.env.STEALTH_POOL_PROGRAM_ID || 'EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq',
    nameRegistryProgramId: process.env.NAME_REGISTRY_PROGRAM_ID || 'JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT',
  },

  relayer: {
    privateKey: process.env.RELAYER_PRIVATE_KEY || '',
    feeBps: parseInt(process.env.RELAYER_FEE_BPS || '10', 10),
    maxPendingTxs: parseInt(process.env.MAX_PENDING_TXS || '50', 10),
  },
} as const;
