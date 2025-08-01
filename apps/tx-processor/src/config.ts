export const config = {
  host: process.env.HOST || 'localhost',
  port: process.env.TX_PROCESSOR_PORT
    ? Number(process.env.TX_PROCESSOR_PORT)
    : 3001,

  // Queue configuration
  queue: {
    region: process.env.AWS_REGION || 'ap-northeast-2',
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

  // Chain configuration (should be provided by queue messages)
  // No default values - chain/network must be explicitly provided

  // Database URL (from shared database package)
  databaseUrl:
    process.env.DATABASE_URL ||
    'mysql://root:pass@localhost:3306/withdrawal_system',
};
