export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export const LogLevel = {
  ERROR: 'error' as LogLevel,
  WARN: 'warn' as LogLevel,
  INFO: 'info' as LogLevel,
  HTTP: 'http' as LogLevel,
  VERBOSE: 'verbose' as LogLevel,
  DEBUG: 'debug' as LogLevel,
  SILLY: 'silly' as LogLevel,
} as const;

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
