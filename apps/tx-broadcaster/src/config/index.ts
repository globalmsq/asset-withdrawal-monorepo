export interface AppConfig {
  // Server Configuration
  NODE_ENV: string;
  HOST: string;
  PORT: number;
  LOG_LEVEL: string;

  // Database Configuration
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_DATABASE: string;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;

  // AWS SQS Configuration
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_ENDPOINT?: string;

  // Queue URLs
  TX_REQUEST_QUEUE_URL: string;
  BROADCAST_QUEUE_URL: string;
  TX_MONITOR_QUEUE_URL: string;

  // Blockchain Configuration
  RPC_URL: string;
  CHAIN_ID: number;

  // Redis Configuration
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getOptionalEnv(
  key: string,
  defaultValue?: string
): string | undefined {
  return process.env[key] || defaultValue;
}

function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
}

export const config: AppConfig = {
  // Server Configuration
  NODE_ENV: getOptionalEnv('NODE_ENV', 'development')!,
  HOST: getOptionalEnv('HOST', 'localhost')!,
  PORT: getNumberEnv('PORT', 3003),
  LOG_LEVEL: getOptionalEnv('LOG_LEVEL', 'info')!,

  // Database Configuration
  MYSQL_HOST: getOptionalEnv('MYSQL_HOST', 'localhost')!,
  MYSQL_PORT: getNumberEnv('MYSQL_PORT', 3306),
  MYSQL_DATABASE: getOptionalEnv('MYSQL_DATABASE', 'withdrawal_system')!,
  MYSQL_USER: getOptionalEnv('MYSQL_USER', 'root')!,
  MYSQL_PASSWORD: getOptionalEnv('MYSQL_PASSWORD', 'pass')!,

  // AWS SQS Configuration
  AWS_REGION: getOptionalEnv('AWS_REGION', 'ap-northeast-2')!,
  AWS_ACCESS_KEY_ID: getOptionalEnv('AWS_ACCESS_KEY_ID', 'test')!,
  AWS_SECRET_ACCESS_KEY: getOptionalEnv('AWS_SECRET_ACCESS_KEY', 'test')!,
  AWS_ENDPOINT: getOptionalEnv('AWS_ENDPOINT'),

  // Queue URLs
  TX_REQUEST_QUEUE_URL: getRequiredEnv('TX_REQUEST_QUEUE_URL'),
  BROADCAST_QUEUE_URL: getRequiredEnv('BROADCAST_QUEUE_URL'),
  TX_MONITOR_QUEUE_URL: getRequiredEnv('TX_MONITOR_QUEUE_URL'),

  // Blockchain Configuration
  RPC_URL: getOptionalEnv('RPC_URL', 'https://rpc-amoy.polygon.technology')!,
  CHAIN_ID: getNumberEnv('CHAIN_ID', 80002),

  // Redis Configuration
  REDIS_HOST: getOptionalEnv('REDIS_HOST', 'localhost')!,
  REDIS_PORT: getNumberEnv('REDIS_PORT', 6379),
  REDIS_PASSWORD: getOptionalEnv('REDIS_PASSWORD'),
};

// Validate configuration on startup
export function validateConfig(): void {
  console.log('[tx-broadcaster] Validating configuration...');

  // Check required URLs
  if (!config.TX_REQUEST_QUEUE_URL) {
    throw new Error('TX_REQUEST_QUEUE_URL is required');
  }
  if (!config.BROADCAST_QUEUE_URL) {
    throw new Error('BROADCAST_QUEUE_URL is required');
  }
  if (!config.TX_MONITOR_QUEUE_URL) {
    throw new Error('TX_MONITOR_QUEUE_URL is required');
  }

  // Validate blockchain configuration
  if (config.CHAIN_ID <= 0) {
    throw new Error('CHAIN_ID must be a positive number');
  }

  console.log('[tx-broadcaster] Configuration validated successfully');
  logEnvironmentOverrides();
}

function logEnvironmentOverrides(): void {
  console.log('[tx-broadcaster] Environment configuration:');

  if (process.env.RPC_URL) {
    console.log(`  - RPC_URL override: ${process.env.RPC_URL}`);
  } else {
    console.log(`  - RPC_URL default: ${config.RPC_URL}`);
  }

  if (process.env.CHAIN_ID) {
    console.log(`  - CHAIN_ID override: ${process.env.CHAIN_ID}`);
  } else {
    console.log(`  - CHAIN_ID default: ${config.CHAIN_ID}`);
  }

  console.log('  - Dynamic chain support enabled via chains.config.json');
  console.log('  - Environment variables take precedence over config file');
}
