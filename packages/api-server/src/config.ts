import { DatabaseConfig } from 'database';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
}

export function loadConfig(): AppConfig {
  return {
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
}