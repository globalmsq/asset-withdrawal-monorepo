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
    txRequestQueueUrl: z.string(),
    signedTxQueueUrl: z.string(),
  }),

  // Polygon
  polygon: z.object({
    network: z.enum(['amoy', 'mainnet']).default('amoy'),
    rpcUrl: z.string(),
    chainId: z.number(),
  }),

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
      txRequestQueueUrl:
        process.env.TX_REQUEST_QUEUE_URL ||
        'http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/tx-request-queue',
      signedTxQueueUrl:
        process.env.SIGNED_TX_QUEUE_URL ||
        'http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/signed-tx-queue',
    },

    polygon: {
      network: (process.env.POLYGON_NETWORK || 'amoy') as 'amoy' | 'mainnet',
      rpcUrl:
        process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology',
      chainId: parseInt(process.env.POLYGON_CHAIN_ID || '80002', 10),
    },

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
  };

  return configSchema.parse(config);
}
