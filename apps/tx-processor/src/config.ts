export const config = {
  host: process.env.HOST || 'localhost',
  port: process.env.TX_PROCESSOR_PORT ? Number(process.env.TX_PROCESSOR_PORT) : 3001,
  
  // Queue configuration
  queue: {
    type: process.env.QUEUE_TYPE || 'in_memory',
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  // Worker configuration
  workers: {
    validationSigning: {
      enabled: process.env.VALIDATION_SIGNING_WORKER_ENABLED !== 'false',
      batchSize: Number(process.env.WORKER_BATCH_SIZE) || 10,
      processingInterval: Number(process.env.WORKER_INTERVAL) || 5000,
    },
    transactionSender: {
      enabled: process.env.TRANSACTION_SENDER_WORKER_ENABLED !== 'false',
      batchSize: Number(process.env.WORKER_BATCH_SIZE) || 5,
      processingInterval: Number(process.env.WORKER_INTERVAL) || 3000,
    },
  },

  // Polygon configuration
  polygon: {
    network: process.env.POLYGON_NETWORK || 'mumbai',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
    chainId: Number(process.env.POLYGON_CHAIN_ID) || 80001,
    confirmations: Number(process.env.POLYGON_CONFIRMATIONS) || 3,
  },

  // Database URL (from shared database package)
  databaseUrl: process.env.DATABASE_URL || 'mysql://root:pass@localhost:3306/withdrawal_system',
};