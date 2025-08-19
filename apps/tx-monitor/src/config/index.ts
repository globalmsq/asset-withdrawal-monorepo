export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl:
    process.env.DATABASE_URL ||
    'mysql://root:root@localhost:3306/withdrawal_db',

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    url: process.env.REDIS_URL,
  },

  // Monitoring Configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    websocketEnabled: process.env.WEBSOCKET_ENABLED !== 'false',
    pollingEnabled: process.env.POLLING_ENABLED !== 'false',
    maxRetries: parseInt(process.env.MONITORING_MAX_RETRIES || '5', 10),
    batchSize: parseInt(process.env.MONITORING_BATCH_SIZE || '30', 10),
    batchDelay: parseInt(process.env.MONITORING_BATCH_DELAY || '100', 10), // ms between batch operations
  },

  // Performance Configuration
  performance: {
    maxConcurrentRpcCalls: parseInt(
      process.env.MAX_CONCURRENT_RPC_CALLS || '10',
      10
    ),
    batchSize: parseInt(process.env.BATCH_SIZE || '30', 10),
    cacheSize: parseInt(process.env.CACHE_SIZE || '10000', 10),
  },

  // Polling Tiers Configuration
  pollingTiers: {
    fast: {
      interval: parseInt(process.env.FAST_POLLING_INTERVAL || '60000', 10), // 1 minute
      maxAge: parseInt(process.env.FAST_POLLING_MAX_AGE || '300000', 10), // 5 minutes
      batchSize: parseInt(process.env.FAST_POLLING_BATCH_SIZE || '30', 10),
    },
    medium: {
      interval: parseInt(process.env.MEDIUM_POLLING_INTERVAL || '600000', 10), // 10 minutes
      maxAge: parseInt(process.env.MEDIUM_POLLING_MAX_AGE || '3600000', 10), // 1 hour
      batchSize: parseInt(process.env.MEDIUM_POLLING_BATCH_SIZE || '50', 10),
    },
    full: {
      interval: parseInt(process.env.FULL_POLLING_INTERVAL || '3600000', 10), // 1 hour
      maxAge: Infinity,
      batchSize: parseInt(process.env.FULL_POLLING_BATCH_SIZE || '100', 10),
    },
  },

  // Timeouts
  timeouts: {
    mempoolDropTimeout: parseInt(
      process.env.MEMPOOL_DROP_TIMEOUT || '86400000',
      10
    ), // 24 hours
    websocketReconnectDelay: parseInt(
      process.env.WEBSOCKET_RECONNECT_DELAY || '5000',
      10
    ), // 5 seconds
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
