export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  SILLY: 'silly',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

export interface LogContext {
  service: string;
  requestId?: string;
  userId?: string;
  transactionHash?: string;
  chainId?: number;
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  level: LogLevel;
  service: string;
  environment?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
  filePath?: string;
  maxFileSize?: string;
  maxFiles?: string;
  format?: 'json' | 'simple';
}

export interface SensitiveDataFilter {
  patterns: RegExp[];
  replacement: string;
}
