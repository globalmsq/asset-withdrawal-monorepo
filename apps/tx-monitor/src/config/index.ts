export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DATABASE || 'withdrawal_system',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'pass',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    url: process.env.REDIS_URL,
  },

  // AWS Configuration for SQS
  aws: {
    region: process.env.AWS_REGION || 'ap-northeast-2',
    endpoint: process.env.AWS_ENDPOINT, // LocalStack endpoint for development
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },

  // SQS Queue URLs
  sqs: {
    broadcastTxQueueUrl:
      process.env.BROADCAST_TX_QUEUE_URL ||
      'http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/broadcast-tx-queue',
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

  // Polling Tiers Configuration - Now serves as backup for WebSocket
  // Increased intervals since WebSocket handles real-time monitoring
  pollingTiers: {
    fast: {
      interval: parseInt(process.env.FAST_POLLING_INTERVAL || '300000', 10), // 5 minutes (was 1 minute)
      maxAge: parseInt(process.env.FAST_POLLING_MAX_AGE || '900000', 10), // 15 minutes (was 5 minutes)
      batchSize: parseInt(process.env.FAST_POLLING_BATCH_SIZE || '30', 10),
    },
    medium: {
      interval: parseInt(process.env.MEDIUM_POLLING_INTERVAL || '1800000', 10), // 30 minutes (was 10 minutes)
      maxAge: parseInt(process.env.MEDIUM_POLLING_MAX_AGE || '7200000', 10), // 2 hours (was 1 hour)
      batchSize: parseInt(process.env.MEDIUM_POLLING_BATCH_SIZE || '50', 10),
    },
    full: {
      interval: parseInt(process.env.FULL_POLLING_INTERVAL || '7200000', 10), // 2 hours (was 1 hour)
      maxAge: Infinity,
      batchSize: parseInt(process.env.FULL_POLLING_BATCH_SIZE || '100', 10),
    },
  },

  // WebSocket Reconnection Configuration
  reconnection: {
    // Short-term reconnection settings (exponential backoff)
    maxAttempts: parseInt(process.env.WS_RECONNECT_MAX_ATTEMPTS || '5', 10),
    initialDelay: parseInt(
      process.env.WS_RECONNECT_INITIAL_DELAY || '5000',
      10
    ), // 5 seconds
    backoffMultiplier: parseFloat(
      process.env.WS_RECONNECT_BACKOFF_MULTIPLIER || '2'
    ),
    maxBackoffDelay: parseInt(
      process.env.WS_RECONNECT_MAX_BACKOFF || '80000',
      10
    ), // 80 seconds

    // Long-term reconnection settings (after max attempts)
    longTermInterval: parseInt(
      process.env.WS_RECONNECT_LONG_TERM_INTERVAL || '300000',
      10
    ), // 5 minutes
    maxLongTermAttempts: parseInt(
      process.env.WS_RECONNECT_MAX_LONG_TERM_ATTEMPTS || '0',
      10
    ), // 0 = unlimited

    // Circuit breaker settings
    enableCircuitBreaker: process.env.WS_CIRCUIT_BREAKER_ENABLED !== 'false',
    circuitBreakerResetTime: parseInt(
      process.env.WS_CIRCUIT_BREAKER_RESET_TIME || '600000',
      10
    ), // 10 minutes
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
    ), // 5 seconds (deprecated - use reconnection.initialDelay)
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
