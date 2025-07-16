export const config = {
  host: process.env.TX_MONITOR_HOST || '0.0.0.0',
  port: parseInt(process.env.TX_MONITOR_PORT || '3002', 10),

  monitoring: {
    // Poll interval in milliseconds (5 minutes)
    pollInterval: parseInt(process.env.MONITOR_POLL_INTERVAL || '300000', 10),
    // Max time to wait for transaction confirmation (30 minutes)
    maxWaitTime: parseInt(process.env.MONITOR_MAX_WAIT_TIME || '1800000', 10),
    // Confirmations required
    confirmationsRequired: parseInt(process.env.CONFIRMATIONS_REQUIRED || '3', 10),
    // Batch size for processing
    batchSize: parseInt(process.env.MONITOR_BATCH_SIZE || '20', 10),
  },

  blockchain: {
    network: process.env.POLYGON_NETWORK || 'amoy',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology',
    chainId: parseInt(process.env.POLYGON_CHAIN_ID || '80002', 10),
  },

  database: {
    url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/withdrawal_db',
  },
};
