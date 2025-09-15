import { DLQMessage } from '../dlq-monitor.service';
import { AnalyzedError } from '../error-analyzer.service';

export interface RecoveryResult {
  success: boolean;
  action: string;
  shouldRetry?: boolean;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface RecoveryStrategy {
  canRecover(error: AnalyzedError): boolean;
  recover(message: DLQMessage, error: AnalyzedError): Promise<RecoveryResult>;
  getMaxRetryCount(): number;
}
