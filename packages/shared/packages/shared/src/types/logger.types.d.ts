export declare const LogLevel: {
    readonly ERROR: "error";
    readonly WARN: "warn";
    readonly INFO: "info";
    readonly HTTP: "http";
    readonly VERBOSE: "verbose";
    readonly DEBUG: "debug";
    readonly SILLY: "silly";
};
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
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
