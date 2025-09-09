import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().default(3007),

  // AWS Configuration
  aws: z.object({
    region: z.string().default('ap-northeast-2'),
    endpoint: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
  }),

  // DLQ URLs (required for processing)
  dlq: z.object({
    txRequestDlqUrl: z.string(),
    signedTxDlqUrl: z.string(),
    broadcastTxDlqUrl: z.string(),
  }),

  // Original Queue URLs (for retry)
  queues: z.object({
    txRequestQueueUrl: z.string(),
    signedTxQueueUrl: z.string(),
    broadcastTxQueueUrl: z.string(),
  }),

  // Retry Configuration
  retry: z.object({
    maxAttempts: z.number().min(1).default(5),
    initialDelayMs: z.number().min(1000).default(60000), // 1 minute
    maxDelayMs: z.number().min(60000).default(21600000), // 6 hours
    backoffMultiplier: z.number().min(1.1).default(2.0),
  }),

  // Database
  database: z.object({
    host: z.string(),
    port: z.number(),
    database: z.string(),
    user: z.string(),
    password: z.string(),
  }),

  // Redis (for caching and coordination)
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
  }),

  // Monitoring
  monitoring: z.object({
    enableMetrics: z.boolean().default(true),
    metricsPort: z.number().default(9097),
  }),

  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3007', 10),

    aws: {
      region: process.env.AWS_REGION || 'ap-northeast-2',
      endpoint: process.env.AWS_ENDPOINT,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },

    dlq: {
      txRequestDlqUrl:
        process.env.TX_REQUEST_DLQ_URL ||
        'http://localhost:4566/000000000000/tx-request-dlq',
      signedTxDlqUrl:
        process.env.SIGNED_TX_DLQ_URL ||
        'http://localhost:4566/000000000000/signed-tx-dlq',
      broadcastTxDlqUrl:
        process.env.BROADCAST_TX_DLQ_URL ||
        'http://localhost:4566/000000000000/broadcast-tx-dlq',
    },

    queues: {
      txRequestQueueUrl:
        process.env.TX_REQUEST_QUEUE_URL ||
        'http://localhost:4566/000000000000/tx-request-queue',
      signedTxQueueUrl:
        process.env.SIGNED_TX_QUEUE_URL ||
        'http://localhost:4566/000000000000/signed-tx-queue',
      broadcastTxQueueUrl:
        process.env.BROADCAST_TX_QUEUE_URL ||
        'http://localhost:4566/000000000000/broadcast-tx-queue',
    },

    retry: {
      maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '5', 10),
      initialDelayMs: parseInt(
        process.env.INITIAL_RETRY_DELAY_MS || '60000',
        10
      ),
      maxDelayMs: parseInt(process.env.MAX_RETRY_DELAY_MS || '21600000', 10),
      backoffMultiplier: parseFloat(
        process.env.RETRY_BACKOFF_MULTIPLIER || '2.0'
      ),
    },

    database: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      database: process.env.MYSQL_DATABASE || 'withdrawal_system',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'pass',
    },

    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },

    monitoring: {
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      metricsPort: parseInt(process.env.METRICS_PORT || '9097', 10),
    },

    logging: {
      level: (process.env.DLQ_HANDLER_LOG_LEVEL || 'info') as
        | 'error'
        | 'warn'
        | 'info'
        | 'debug',
    },
  };

  return configSchema.parse(config);
}
