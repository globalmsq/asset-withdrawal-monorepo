import { LoggerService } from 'shared';
import { DLQMessage } from './dlq-monitor.service';

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  NONCE_ERROR = 'NONCE_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  GAS_ERROR = 'GAS_ERROR',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export interface AnalyzedError {
  type: ErrorType;
  isRetryable: boolean;
  suggestedStrategy: string;
  details: {
    originalError: string;
    parsedMessage?: string;
    errorCode?: string;
    additionalInfo?: Record<string, any>;
  };
}

export class ErrorAnalyzerService {
  constructor(private readonly logger: LoggerService) {}

  analyze(dlqMessage: DLQMessage): AnalyzedError {
    const errorString =
      typeof dlqMessage.error === 'string'
        ? dlqMessage.error
        : JSON.stringify(dlqMessage.error);

    this.logger.debug('Analyzing error:', { metadata: { error: errorString } });

    // Check for nonce errors
    if (this.isNonceError(errorString)) {
      return {
        type: ErrorType.NONCE_ERROR,
        isRetryable: true,
        suggestedStrategy: 'NonceErrorRecovery',
        details: {
          originalError: errorString,
          parsedMessage: 'Nonce conflict detected',
          additionalInfo: this.extractNonceInfo(errorString),
        },
      };
    }

    // Check for insufficient funds
    if (this.isInsufficientFundsError(errorString)) {
      return {
        type: ErrorType.INSUFFICIENT_FUNDS,
        isRetryable: false,
        suggestedStrategy: 'InsufficientFundsRecovery',
        details: {
          originalError: errorString,
          parsedMessage: 'Insufficient balance for transaction',
        },
      };
    }

    // Check for gas errors
    if (this.isGasError(errorString)) {
      return {
        type: ErrorType.GAS_ERROR,
        isRetryable: true,
        suggestedStrategy: 'GasErrorRecovery',
        details: {
          originalError: errorString,
          parsedMessage: 'Gas estimation or price issue',
        },
      };
    }

    // Check for network errors
    if (this.isNetworkError(errorString)) {
      return {
        type: ErrorType.NETWORK_ERROR,
        isRetryable: true,
        suggestedStrategy: 'NetworkErrorRecovery',
        details: {
          originalError: errorString,
          parsedMessage: 'Network connectivity issue',
        },
      };
    }

    // Check for timeout errors
    if (this.isTimeoutError(errorString)) {
      return {
        type: ErrorType.TIMEOUT,
        isRetryable: true,
        suggestedStrategy: 'TimeoutRecovery',
        details: {
          originalError: errorString,
          parsedMessage: 'Operation timed out',
        },
      };
    }

    // Check for invalid address
    if (this.isInvalidAddressError(errorString)) {
      return {
        type: ErrorType.INVALID_ADDRESS,
        isRetryable: false,
        suggestedStrategy: 'InvalidAddressRecovery',
        details: {
          originalError: errorString,
          parsedMessage: 'Invalid blockchain address',
        },
      };
    }

    // Default to unknown error
    return {
      type: ErrorType.UNKNOWN,
      isRetryable: true,
      suggestedStrategy: 'UnknownErrorRecovery',
      details: {
        originalError: errorString,
        parsedMessage: 'Unclassified error',
      },
    };
  }

  private isNonceError(error: string): boolean {
    const noncePatterns = [
      /nonce too (low|high)/i,
      /nonce.*conflict/i,
      /replacement transaction underpriced/i,
      /known transaction/i,
      /already known/i,
    ];
    return noncePatterns.some(pattern => pattern.test(error));
  }

  private isInsufficientFundsError(error: string): boolean {
    const fundPatterns = [
      /insufficient funds/i,
      /insufficient balance/i,
      /not enough funds/i,
      /exceeds balance/i,
    ];
    return fundPatterns.some(pattern => pattern.test(error));
  }

  private isGasError(error: string): boolean {
    const gasPatterns = [
      /gas too low/i,
      /out of gas/i,
      /gas required exceeds/i,
      /intrinsic gas too low/i,
      /max fee per gas/i,
    ];
    return gasPatterns.some(pattern => pattern.test(error));
  }

  private isNetworkError(error: string): boolean {
    const networkPatterns = [
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /network error/i,
      /connection refused/i,
      /could not connect/i,
      /ENOTFOUND/i,
    ];
    return networkPatterns.some(pattern => pattern.test(error));
  }

  private isTimeoutError(error: string): boolean {
    const timeoutPatterns = [/timeout/i, /timed out/i, /deadline exceeded/i];
    return timeoutPatterns.some(pattern => pattern.test(error));
  }

  private isInvalidAddressError(error: string): boolean {
    const addressPatterns = [
      /invalid address/i,
      /ENS name not configured/i,
      /bad address checksum/i,
    ];
    return addressPatterns.some(pattern => pattern.test(error));
  }

  private extractNonceInfo(error: string): Record<string, any> {
    const info: Record<string, any> = {};

    // Try to extract expected and actual nonce
    const nonceMatch = error.match(/nonce (\d+).*expected.*(\d+)/i);
    if (nonceMatch) {
      info.actualNonce = parseInt(nonceMatch[1], 10);
      info.expectedNonce = parseInt(nonceMatch[2], 10);
    }

    // Check if it's a "nonce too high" error
    if (/nonce too high/i.test(error)) {
      info.errorType = 'NONCE_TOO_HIGH';
      info.requiresDummyTx = true;
    } else if (/nonce too low/i.test(error)) {
      info.errorType = 'NONCE_TOO_LOW';
      info.requiresDummyTx = false;
    }

    return info;
  }
}
