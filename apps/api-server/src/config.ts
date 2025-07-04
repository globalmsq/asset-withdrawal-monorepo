import { DatabaseConfig } from 'database';
import { AppError, ErrorCode } from 'shared';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
}

export function loadConfig(): AppConfig {
  const config: AppConfig = {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'pass',
      database: process.env.MYSQL_DATABASE || 'withdrawal_system',
    },
  };
  
  validateConfig(config);
  return config;
}

function validateConfig(config: AppConfig): void {
  // Validate port
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid port number: ${process.env.PORT}`,
      500
    );
  }
  
  // Validate database port
  if (isNaN(config.database.port) || config.database.port < 1 || config.database.port > 65535) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid database port number: ${process.env.MYSQL_PORT}`,
      500
    );
  }
  
  // Validate node environment
  const validEnvs = ['development', 'test', 'production', 'staging'];
  if (!validEnvs.includes(config.nodeEnv)) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid NODE_ENV: ${config.nodeEnv}. Must be one of: ${validEnvs.join(', ')}`,
      500
    );
  }
  
  // In production, ensure required database config is provided
  if (config.nodeEnv === 'production') {
    if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Database configuration is required in production (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD)',
        500
      );
    }
  }
}