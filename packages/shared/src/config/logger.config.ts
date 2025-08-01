import { LoggerConfig, LogLevel } from '../types/logger.types';

export const getDefaultLoggerConfig = (service: string, environment = 'development'): LoggerConfig => {
  const isProduction = environment === 'production';

  return {
    level: (process.env.LOG_LEVEL as LogLevel) || (isProduction ? 'info' : 'debug'),
    service,
    environment,
    enableConsole: true,
    enableFile: isProduction,
    filePath: process.env.LOG_FILE_PATH || './logs',
    maxFileSize: process.env.LOG_MAX_FILE_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    format: (process.env.LOG_FORMAT as 'json' | 'simple') || (isProduction ? 'json' : 'simple'),
  };
};

// Sensitive data patterns to filter out from logs
export const SENSITIVE_PATTERNS = [
  // Private keys
  /private[_-]?key["\s]*[:=]\s*["']?[a-fA-F0-9]{64}["']?/gi,

  // AWS credentials
  /aws[_-]?access[_-]?key[_-]?id["\s]*[:=]\s*["']?[A-Z0-9]{20}["']?/gi,
  /aws[_-]?secret[_-]?access[_-]?key["\s]*[:=]\s*["']?[a-zA-Z0-9/+=]{40}["']?/gi,

  // API keys
  /api[_-]?key["\s]*[:=]\s*["']?[a-zA-Z0-9-_]{20,}["']?/gi,

  // Passwords
  /password["\s]*[:=]\s*["']?[^"'\s]+["']?/gi,

  // JWT tokens
  /Bearer\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,

  // Email addresses (optional - uncomment if needed)
  // /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

export const SENSITIVE_REPLACEMENT = '[REDACTED]';
