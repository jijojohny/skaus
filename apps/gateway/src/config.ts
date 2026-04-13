import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:4000').split(','),

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

  /**
   * Light Protocol / ZK compression endpoints.
   * On devnet, Helius runs the Photon indexer so the compression endpoint
   * is often the same as the Solana RPC URL.
   */
  compression: {
    /** Photon compression API endpoint (Photon indexer). */
    rpcUrl: process.env.LIGHT_RPC_URL || process.env.SOLANA_RPC_URL || 'http://localhost:8899',
    /** ZK prover endpoint — required for generating validity proofs. */
    proverUrl: process.env.LIGHT_PROVER_URL || 'https://prover.lightprotocol.com',
    /**
     * Whether ZK compression is enabled. Set to 'false' in local dev to skip
     * Light Protocol calls and rely solely on Postgres.
     */
    enabled: process.env.ZK_COMPRESSION_ENABLED !== 'false',
  },

  /** Used to build absolute pay links returned from POST /requests */
  webAppPublicUrl: (process.env.WEB_APP_PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),
} as const;
