import { LoggerService } from 'shared';

export interface MessageMetrics {
  messageId: string;
  queueType: 'tx-request' | 'signed-tx' | 'broadcast-tx';
  status: 'processing' | 'completed' | 'failed' | 'retrying';
  startTime: Date;
  endTime?: Date;
  processingDuration?: number;
  retryCount: number;
  errorType?: string;
  lastError?: string;
}

export interface SystemMetrics {
  totalMessagesReceived: number;
  totalMessagesProcessed: number;
  totalMessagesSucceeded: number;
  totalMessagesFailed: number;
  averageProcessingTime: number;
  messagesPerQueue: {
    'tx-request': number;
    'signed-tx': number;
    'broadcast-tx': number;
  };
  errorTypeDistribution: Record<string, number>;
  retryDistribution: Record<number, number>;
}

export class MetricsCollectorService {
  private messageMetrics = new Map<string, MessageMetrics>();
  private systemMetrics: SystemMetrics = {
    totalMessagesReceived: 0,
    totalMessagesProcessed: 0,
    totalMessagesSucceeded: 0,
    totalMessagesFailed: 0,
    averageProcessingTime: 0,
    messagesPerQueue: {
      'tx-request': 0,
      'signed-tx': 0,
      'broadcast-tx': 0,
    },
    errorTypeDistribution: {},
    retryDistribution: {},
  };

  constructor(private readonly logger: LoggerService) {}

  startMessageProcessing(
    messageId: string,
    queueType: MessageMetrics['queueType']
  ): void {
    const metric: MessageMetrics = {
      messageId,
      queueType,
      status: 'processing',
      startTime: new Date(),
      retryCount: 0,
    };

    this.messageMetrics.set(messageId, metric);
    this.systemMetrics.totalMessagesReceived++;
    this.systemMetrics.messagesPerQueue[queueType]++;

    this.logger.debug('Started message processing tracking', {
      metadata: { messageId, queueType },
    });
  }

  completeMessageProcessing(
    messageId: string,
    success: boolean,
    errorType?: string,
    errorMessage?: string
  ): void {
    const metric = this.messageMetrics.get(messageId);
    if (!metric) {
      this.logger.warn('Message metric not found for completion', {
        metadata: { messageId },
      });
      return;
    }

    const endTime = new Date();
    const processingDuration = endTime.getTime() - metric.startTime.getTime();

    metric.endTime = endTime;
    metric.processingDuration = processingDuration;
    metric.status = success ? 'completed' : 'failed';

    if (!success && errorType) {
      metric.errorType = errorType;
      metric.lastError = errorMessage;
      this.systemMetrics.errorTypeDistribution[errorType] =
        (this.systemMetrics.errorTypeDistribution[errorType] || 0) + 1;
      this.systemMetrics.totalMessagesFailed++;
    } else {
      this.systemMetrics.totalMessagesSucceeded++;
    }

    this.systemMetrics.totalMessagesProcessed++;
    this.updateRetryDistribution(metric.retryCount);
    this.updateAverageProcessingTime(processingDuration);

    this.logger.info('Completed message processing tracking', {
      metadata: {
        messageId,
        success,
        processingDuration,
        retryCount: metric.retryCount,
        errorType,
      },
    });

    // Clean up completed message metrics after logging
    // Keep only recent metrics in memory
    setTimeout(() => {
      this.messageMetrics.delete(messageId);
    }, 60000); // Keep for 1 minute
  }

  incrementRetryCount(messageId: string): void {
    const metric = this.messageMetrics.get(messageId);
    if (metric) {
      metric.retryCount++;
      metric.status = 'retrying';

      this.logger.debug('Incremented retry count for message', {
        metadata: { messageId, retryCount: metric.retryCount },
      });
    }
  }

  getMessageMetric(messageId: string): MessageMetrics | undefined {
    return this.messageMetrics.get(messageId);
  }

  getActiveMessageCount(): number {
    return Array.from(this.messageMetrics.values()).filter(
      m => m.status === 'processing' || m.status === 'retrying'
    ).length;
  }

  getSystemMetrics(): SystemMetrics {
    return { ...this.systemMetrics };
  }

  getMessagesByStatus(status: MessageMetrics['status']): MessageMetrics[] {
    return Array.from(this.messageMetrics.values()).filter(
      m => m.status === status
    );
  }

  getProcessingTimePercentiles(): {
    p50: number;
    p95: number;
    p99: number;
  } {
    const completedMetrics = Array.from(this.messageMetrics.values())
      .filter(m => m.processingDuration !== undefined)
      .map(m => m.processingDuration!)
      .sort((a, b) => a - b);

    if (completedMetrics.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const p50Index = Math.floor(completedMetrics.length * 0.5);
    const p95Index = Math.floor(completedMetrics.length * 0.95);
    const p99Index = Math.floor(completedMetrics.length * 0.99);

    return {
      p50: completedMetrics[p50Index] || 0,
      p95: completedMetrics[p95Index] || 0,
      p99: completedMetrics[p99Index] || 0,
    };
  }

  logMetricsSummary(): void {
    const metrics = this.getSystemMetrics();
    const percentiles = this.getProcessingTimePercentiles();
    const activeCount = this.getActiveMessageCount();

    this.logger.info('Metrics Summary', {
      metadata: {
        totalReceived: metrics.totalMessagesReceived,
        totalProcessed: metrics.totalMessagesProcessed,
        successRate:
          metrics.totalMessagesProcessed > 0
            ? (
                (metrics.totalMessagesSucceeded /
                  metrics.totalMessagesProcessed) *
                100
              ).toFixed(2) + '%'
            : '0%',
        averageProcessingTime: metrics.averageProcessingTime.toFixed(2) + 'ms',
        activeMessages: activeCount,
        messagesPerQueue: metrics.messagesPerQueue,
        processingTimePercentiles: {
          p50: percentiles.p50.toFixed(2) + 'ms',
          p95: percentiles.p95.toFixed(2) + 'ms',
          p99: percentiles.p99.toFixed(2) + 'ms',
        },
        topErrors: this.getTopErrors(5),
      },
    });
  }

  private updateRetryDistribution(retryCount: number): void {
    this.systemMetrics.retryDistribution[retryCount] =
      (this.systemMetrics.retryDistribution[retryCount] || 0) + 1;
  }

  private updateAverageProcessingTime(processingDuration: number): void {
    const currentAvg = this.systemMetrics.averageProcessingTime;
    const totalProcessed = this.systemMetrics.totalMessagesProcessed;

    // Calculate running average
    this.systemMetrics.averageProcessingTime =
      (currentAvg * (totalProcessed - 1) + processingDuration) / totalProcessed;
  }

  private getTopErrors(
    limit: number
  ): Array<{ errorType: string; count: number }> {
    return Object.entries(this.systemMetrics.errorTypeDistribution)
      .map(([errorType, count]) => ({ errorType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
