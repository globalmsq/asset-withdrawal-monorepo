import { BroadcastError, RetryConfig } from '../types';

/**
 * RetryService - 지수 백오프 재시도 로직 구현
 *
 * 트랜잭션 브로드캐스트 실패 시 재시도 가능 여부를 판단하고
 * 지수 백오프 알고리즘을 사용하여 재시도를 수행합니다.
 */
export class RetryService {
  private defaultConfig: RetryConfig = {
    maxRetries: 5,
    baseDelay: 1000, // 1초
    maxDelay: 30000, // 30초
    backoffMultiplier: 2,
  };

  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * 에러가 재시도 가능한지 판단합니다
   */
  isRetryableError(error: any): boolean {
    // BroadcastError인 경우 retryable 플래그 확인
    if (error instanceof BroadcastError) {
      return error.retryable;
    }

    // Ethers.js 에러 코드 기반 판단
    if (error.code) {
      return this.isRetryableErrorCode(error.code);
    }

    // 에러 메시지 기반 판단
    if (error.message) {
      return this.isRetryableErrorMessage(error.message);
    }

    // 기본적으로 재시도하지 않음
    return false;
  }

  /**
   * Ethers.js 에러 코드가 재시도 가능한지 판단
   */
  private isRetryableErrorCode(code: string): boolean {
    const retryableErrors = [
      'NETWORK_ERROR',
      'SERVER_ERROR',
      'TIMEOUT',
      'NONCE_EXPIRED',
      'REPLACEMENT_UNDERPRICED',
      'UNPREDICTABLE_GAS_LIMIT',
      'PROVIDER_ERROR',
    ];

    const nonRetryableErrors = [
      'INSUFFICIENT_FUNDS',
      'INVALID_ARGUMENT',
      'MISSING_ARGUMENT',
      'UNEXPECTED_ARGUMENT',
      'VALUE_MISMATCH',
      'TRANSACTION_REPLACED',
    ];

    // 명시적으로 재시도 불가능한 에러인지 확인
    if (nonRetryableErrors.includes(code)) {
      return false;
    }

    // 재시도 가능한 에러인지 확인
    return retryableErrors.includes(code);
  }

  /**
   * Nonce 관련 에러를 감지하고 처리 방법을 제안합니다
   */
  detectNonceConflict(error: any): {
    isNonceConflict: boolean;
    conflictType: 'too_low' | 'too_high' | 'pending' | 'unknown';
    details?: string;
  } {
    const message = error.message?.toLowerCase() || '';
    const code = error.code;

    // Ethers.js nonce 에러 코드
    if (code === 'NONCE_EXPIRED' || code === 'REPLACEMENT_UNDERPRICED') {
      return {
        isNonceConflict: true,
        conflictType: 'too_low',
        details: 'Transaction nonce is too low, need to get fresh nonce',
      };
    }

    // 일반적인 nonce 에러 메시지 패턴들
    if (message.includes('nonce too low')) {
      return {
        isNonceConflict: true,
        conflictType: 'too_low',
        details:
          'Nonce is lower than expected, likely due to previous transaction',
      };
    }

    if (message.includes('nonce too high')) {
      return {
        isNonceConflict: true,
        conflictType: 'too_high',
        details: 'Nonce is higher than current, wait for pending transactions',
      };
    }

    if (
      message.includes('already known') ||
      message.includes('transaction underpriced')
    ) {
      return {
        isNonceConflict: true,
        conflictType: 'pending',
        details:
          'Transaction with same nonce is pending, retry with higher gas price',
      };
    }

    // RPC 특정 nonce 에러들
    const noncePatterns = [
      /nonce.*too.*low/i,
      /nonce.*too.*high/i,
      /invalid.*nonce/i,
      /transaction.*nonce/i,
      /old.*nonce/i,
      /stale.*nonce/i,
    ];

    for (const pattern of noncePatterns) {
      if (pattern.test(message)) {
        return {
          isNonceConflict: true,
          conflictType: 'unknown',
          details: `Nonce conflict detected: ${message}`,
        };
      }
    }

    return {
      isNonceConflict: false,
      conflictType: 'unknown',
    };
  }

  /**
   * 에러 메시지가 재시도 가능한지 판단
   */
  private isRetryableErrorMessage(message: string): boolean {
    const retryablePatterns = [
      /network.*error/i,
      /connection.*error/i,
      /timeout/i,
      /rate.*limit/i,
      /temporary.*unavailable/i,
      /service.*unavailable/i,
      /internal.*server.*error/i,
      /bad.*gateway/i,
      /gateway.*timeout/i,
    ];

    const nonRetryablePatterns = [
      /insufficient.*funds/i,
      /invalid.*signature/i,
      /invalid.*transaction/i,
      /transaction.*reverted/i,
      /execution.*reverted/i,
      /gas.*required.*exceeds.*allowance/i,
      /intrinsic.*gas.*too.*low/i,
    ];

    // 명시적으로 재시도 불가능한 패턴 확인
    for (const pattern of nonRetryablePatterns) {
      if (pattern.test(message)) {
        return false;
      }
    }

    // 재시도 가능한 패턴 확인
    for (const pattern of retryablePatterns) {
      if (pattern.test(message)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 재시도 지연 시간을 계산합니다 (지수 백오프)
   */
  calculateDelay(attempt: number): number {
    const baseDelay = this.config.baseDelay || this.defaultConfig.baseDelay;
    const multiplier =
      this.config.backoffMultiplier || this.defaultConfig.backoffMultiplier;
    const maxDelay = this.config.maxDelay || this.defaultConfig.maxDelay;

    // 지수 백오프: baseDelay * (multiplier ^ attempt)
    const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);

    // 최대 지연시간 제한
    const cappedDelay = Math.min(exponentialDelay, maxDelay);

    // 지터 추가 (±25% 랜덤 변동)
    const jitterRange = cappedDelay * 0.25;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;

    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * 최대 재시도 횟수를 반환합니다
   */
  getMaxRetries(): number {
    return this.config.maxRetries || this.defaultConfig.maxRetries;
  }

  /**
   * 재시도 가능한 에러인지 확인하고 재시도 지연시간을 계산합니다
   */
  shouldRetry(
    error: any,
    currentAttempt: number
  ): {
    shouldRetry: boolean;
    delay: number;
    reason?: string;
  } {
    const maxRetries = this.getMaxRetries();

    // 최대 재시도 횟수 초과 확인
    if (currentAttempt >= maxRetries) {
      return {
        shouldRetry: false,
        delay: 0,
        reason: `Maximum retry attempts (${maxRetries}) exceeded`,
      };
    }

    // 재시도 가능한 에러인지 확인
    if (!this.isRetryableError(error)) {
      return {
        shouldRetry: false,
        delay: 0,
        reason: `Error is not retryable: ${error.code || error.message || 'Unknown error'}`,
      };
    }

    // 재시도 가능한 경우 지연시간 계산
    const delay = this.calculateDelay(currentAttempt);

    return {
      shouldRetry: true,
      delay,
      reason: `Retryable error detected, waiting ${Math.round(delay)}ms before attempt ${currentAttempt + 1}/${maxRetries}`,
    };
  }

  /**
   * 에러를 분류하고 분석 정보를 반환합니다
   */
  analyzeError(error: any): {
    type: 'NETWORK' | 'NONCE' | 'GAS' | 'FUNDS' | 'VALIDATION' | 'UNKNOWN';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    retryable: boolean;
    description: string;
  } {
    let type: 'NETWORK' | 'NONCE' | 'GAS' | 'FUNDS' | 'VALIDATION' | 'UNKNOWN' =
      'UNKNOWN';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    let description = error.message || error.toString();

    if (error instanceof BroadcastError) {
      description = error.message;

      switch (error.code) {
        case 'NETWORK_ERROR':
        case 'SERVER_ERROR':
        case 'PROVIDER_ERROR':
          type = 'NETWORK';
          severity = 'HIGH';
          break;
        case 'NONCE_OR_GAS_ERROR':
        case 'NONCE_EXPIRED':
          type = 'NONCE';
          severity = 'MEDIUM';
          break;
        case 'INSUFFICIENT_FUNDS':
          type = 'FUNDS';
          severity = 'CRITICAL';
          break;
        default:
          type = 'UNKNOWN';
      }
    } else if (error.code) {
      switch (error.code) {
        case 'NETWORK_ERROR':
        case 'SERVER_ERROR':
          type = 'NETWORK';
          severity = 'HIGH';
          break;
        case 'NONCE_EXPIRED':
        case 'REPLACEMENT_UNDERPRICED':
          type = 'NONCE';
          severity = 'MEDIUM';
          break;
        case 'INSUFFICIENT_FUNDS':
          type = 'FUNDS';
          severity = 'CRITICAL';
          break;
        case 'UNPREDICTABLE_GAS_LIMIT':
          type = 'GAS';
          severity = 'HIGH';
          break;
        case 'INVALID_ARGUMENT':
        case 'MISSING_ARGUMENT':
          type = 'VALIDATION';
          severity = 'CRITICAL';
          break;
      }
    }

    const retryable = this.isRetryableError(error);

    return {
      type,
      severity,
      retryable,
      description,
    };
  }

  /**
   * 에러 통계를 위한 메트릭 정보를 생성합니다
   */
  generateErrorMetrics(
    error: any,
    attempt: number,
    maxRetries: number
  ): {
    errorType: string;
    errorCode: string;
    severity: string;
    retryable: boolean;
    currentAttempt: number;
    maxRetries: number;
    timestamp: string;
  } {
    const analysis = this.analyzeError(error);

    return {
      errorType: analysis.type,
      errorCode: error.code || 'UNKNOWN',
      severity: analysis.severity,
      retryable: analysis.retryable,
      currentAttempt: attempt,
      maxRetries,
      timestamp: new Date().toISOString(),
    };
  }
}
