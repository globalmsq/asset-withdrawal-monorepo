import { LoggerService } from 'shared';
import { Config } from '../config';
import { DLQMessage, DLQMonitorService } from './dlq-monitor.service';
import { ErrorAnalyzerService, AnalyzedError } from './error-analyzer.service';
import { RecoveryStrategy } from './recovery-strategies/recovery-strategy.interface';
import { NetworkErrorRecovery } from './recovery-strategies/network-error.recovery';
import { NonceErrorRecovery } from './recovery-strategies/nonce-error.recovery';
import { GasErrorRecovery } from './recovery-strategies/gas-error.recovery';
import { UnknownErrorRecovery } from './recovery-strategies/unknown-error.recovery';

export class RecoveryOrchestratorService {
  private dlqMonitor: DLQMonitorService;
  private errorAnalyzer: ErrorAnalyzerService;
  private strategies: Map<string, RecoveryStrategy>;
  private isRunning = false;

  constructor(
    private readonly config: Config,
    private readonly logger: LoggerService
  ) {
    this.dlqMonitor = new DLQMonitorService(config, logger);
    this.errorAnalyzer = new ErrorAnalyzerService(logger);
    this.strategies = this.initializeStrategies();
  }

  private initializeStrategies(): Map<string, RecoveryStrategy> {
    const strategies = new Map<string, RecoveryStrategy>();

    strategies.set(
      'NetworkErrorRecovery',
      new NetworkErrorRecovery(this.config, this.logger)
    );
    strategies.set(
      'NonceErrorRecovery',
      new NonceErrorRecovery(this.config, this.logger)
    );
    strategies.set(
      'GasErrorRecovery',
      new GasErrorRecovery(this.config, this.logger)
    );
    strategies.set(
      'UnknownErrorRecovery',
      new UnknownErrorRecovery(this.config, this.logger)
    );

    // Add more strategies as they are implemented

    return strategies;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Recovery Orchestrator is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting Recovery Orchestrator Service');

    // Start DLQ monitoring
    await this.dlqMonitor.start();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info('Stopping Recovery Orchestrator Service');

    // Stop DLQ monitoring
    await this.dlqMonitor.stop();
  }

  async processMessage(dlqMessage: DLQMessage): Promise<void> {
    try {
      // Analyze the error
      const analyzedError = this.errorAnalyzer.analyze(dlqMessage);

      this.logger.info('Analyzed DLQ message', {
        metadata: {
          messageId: dlqMessage.id,
          errorType: analyzedError.type,
          isRetryable: analyzedError.isRetryable,
          strategy: analyzedError.suggestedStrategy,
        },
      });

      // Get the appropriate recovery strategy
      const strategy = this.strategies.get(analyzedError.suggestedStrategy);

      if (!strategy) {
        this.logger.error(
          `No recovery strategy found for ${analyzedError.suggestedStrategy}`
        );
        // Fall back to unknown error recovery
        const fallbackStrategy = this.strategies.get('UnknownErrorRecovery');
        if (fallbackStrategy && fallbackStrategy.canRecover(analyzedError)) {
          await this.executeRecovery(
            fallbackStrategy,
            dlqMessage,
            analyzedError
          );
        }
        return;
      }

      // Check if the strategy can handle this error
      if (!strategy.canRecover(analyzedError)) {
        this.logger.warn('Strategy cannot recover this error', {
          metadata: {
            strategy: analyzedError.suggestedStrategy,
            errorType: analyzedError.type,
          },
        });
        return;
      }

      // Execute recovery
      await this.executeRecovery(strategy, dlqMessage, analyzedError);
    } catch (error) {
      this.logger.error('Failed to process message in orchestrator:', error);
    }
  }

  private async executeRecovery(
    strategy: RecoveryStrategy,
    dlqMessage: DLQMessage,
    analyzedError: AnalyzedError
  ): Promise<void> {
    try {
      const result = await strategy.recover(dlqMessage, analyzedError);

      if (result.success) {
        this.logger.info('Recovery successful', {
          metadata: {
            messageId: dlqMessage.id,
            strategy: analyzedError.suggestedStrategy,
            action: result.action,
          },
        });
      } else {
        this.logger.warn('Recovery failed', {
          metadata: {
            messageId: dlqMessage.id,
            strategy: analyzedError.suggestedStrategy,
            reason: result.reason,
          },
        });

        // Check if we should retry
        if (result.shouldRetry && this.shouldRetryRecovery(dlqMessage)) {
          // TODO: Implement retry logic with exponential backoff
          this.logger.info('Scheduling retry for failed recovery');
        } else {
          // TODO: Send to permanent failure handling
          this.logger.error('Message permanently failed recovery');
        }
      }
    } catch (error) {
      this.logger.error('Error executing recovery strategy:', error);
    }
  }

  private shouldRetryRecovery(dlqMessage: DLQMessage): boolean {
    // TODO: Check retry count from message attributes or database
    // For now, always allow retry up to max attempts
    return true;
  }
}
