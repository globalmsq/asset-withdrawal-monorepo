import { LoggerConfig } from '../types/logger.types';
export declare const getDefaultLoggerConfig: (service: string, environment?: string) => LoggerConfig;
export declare const SENSITIVE_PATTERNS: RegExp[];
export declare const SENSITIVE_REPLACEMENT = "[REDACTED]";
