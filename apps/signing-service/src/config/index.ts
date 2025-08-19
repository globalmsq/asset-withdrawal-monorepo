import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Security
  encryptionKey: z.string().min(32),

  // AWS
  aws: z.object({
    region: z.string().default('ap-northeast-2'),
    endpoint: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
  }),

  // Secrets Manager
  secretsManager: z.object({
    privateKeySecret: z.string(),
  }),

  // Queue
  queue: z.object({
    requestQueueUrl: z.string(),
    signedTxQueueUrl: z.string(),
    // DLQ URLs (optional)
    requestDlqUrl: z.string().optional(),
    signedTxDlqUrl: z.string().optional(),
  }),

  // Chain configuration (should be provided by queue messages)
  // No default values - chain/network must be explicitly provided

  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    auditLogPath: z.string().default('./logs/audit.log'),
  }),

  // Database
  database: z.object({
    host: z.string(),
    port: z.number(),
    database: z.string(),
    user: z.string(),
    password: z.string(),
  }),

  // Batch Processing
  batchProcessing: z.object({
    enabled: z.boolean().default(true),
    minBatchSize: z.number().min(1).default(5),
    batchThreshold: z.number().min(1).default(3),
    minGasSavingsPercent: z.number().min(0).max(100).default(20),
    singleTxGasEstimate: z.number().default(65000),
    batchBaseGas: z.number().default(100000),
    batchPerTxGas: z.number().default(25000),
  }),

  // Redis configuration
  redis: z
    .object({
      host: z.string().default('localhost'),
      port: z.number().default(6379),
    })
    .optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const config = {
    nodeEnv: process.env.NODE_ENV || 'development',

    encryptionKey:
      process.env.SIGNING_SERVICE_ENCRYPTION_KEY ||
      'dev-encryption-key-exactly-32chr',

    aws: {
      region: process.env.AWS_REGION || 'ap-northeast-2',
      endpoint: process.env.AWS_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },

    secretsManager: {
      privateKeySecret:
        process.env.SIGNING_SERVICE_PRIVATE_KEY_SECRET ||
        'signing-service/private-key',
    },

    queue: {
      requestQueueUrl:
        process.env.REQUEST_QUEUE_URL ||
        process.env.TX_REQUEST_QUEUE_URL || // Fallback for backward compatibility
        'http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/tx-request-queue',
      signedTxQueueUrl:
        process.env.SIGNED_TX_QUEUE_URL ||
        'http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/signed-tx-queue',
      requestDlqUrl: process.env.REQUEST_DLQ_URL,
      signedTxDlqUrl: process.env.SIGNED_TX_DLQ_URL,
    },

    // Chain configuration will be provided by queue messages

    logging: {
      level: (process.env.SIGNING_SERVICE_LOG_LEVEL || 'info') as
        | 'error'
        | 'warn'
        | 'info'
        | 'debug',
      auditLogPath:
        process.env.SIGNING_SERVICE_AUDIT_LOG_PATH || './logs/audit.log',
    },

    database: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      database: process.env.MYSQL_DATABASE || 'withdrawal_system',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'pass',
    },

    batchProcessing: {
      enabled: process.env.ENABLE_BATCH_PROCESSING === 'false' ? false : true,
      minBatchSize: parseInt(process.env.MIN_BATCH_SIZE || '5', 10),
      batchThreshold: parseInt(process.env.BATCH_THRESHOLD || '3', 10),
      minGasSavingsPercent: parseFloat(
        process.env.MIN_GAS_SAVINGS_PERCENT || '20'
      ),
      singleTxGasEstimate: parseInt(
        process.env.SINGLE_TX_GAS_ESTIMATE || '65000',
        10
      ),
      batchBaseGas: parseInt(process.env.BATCH_BASE_GAS || '100000', 10),
      batchPerTxGas: parseInt(process.env.BATCH_PER_TX_GAS || '25000', 10),
    },

    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  };

  return configSchema.parse(config);
}
