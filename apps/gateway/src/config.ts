import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:4000')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),

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

  /**
   * Helius Geyser WebSocket for real-time deposit monitoring.
   * When apiKey is set the indexer opens a logsSubscribe WebSocket alongside
   * the polling fallback. Polling always runs as a catch-up safety net.
   */
  helius: {
    apiKey: process.env.HELIUS_API_KEY || '',
    /**
     * Explicit WebSocket URL override. If empty, derived automatically from
     * apiKey + cluster (mainnet-beta → mainnet, devnet → devnet).
     */
    wsUrl: process.env.HELIUS_WS_URL || '',
  },

  /** Used to build absolute pay links returned from POST /requests */
  webAppPublicUrl: (process.env.WEB_APP_PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),

  /**
   * 64-char hex string (32 bytes) used as AES-256-GCM master key for gated
   * content URI encryption. Generate with: openssl rand -hex 32
   * Falls back to a fixed dev key — override in production.
   */
  gatedContentKey: process.env.GATED_CONTENT_KEY
    || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',

  /** Absolute directory where avatar images are stored on disk. */
  uploadsDir: process.env.UPLOADS_DIR || './uploads',

  /** Public base URL for the gateway (used to construct avatar URLs). */
  gatewayPublicUrl: (process.env.GATEWAY_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, ''),

  /**
   * GoldRush (Covalent) API key for blockchain data enrichment.
   * Sign up at https://goldrush.dev to get a key.
   * When empty, analytics endpoints return empty data gracefully.
   */
  goldrushApiKey: process.env.GOLDRUSH_API_KEY || '',
} as const;
