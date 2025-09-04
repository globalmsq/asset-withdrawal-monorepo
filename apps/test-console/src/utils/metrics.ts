import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

export interface PerformanceMetric {
  timestamp: number;
  responseTime: number;
  status: 'success' | 'error';
  requestId?: string;
  errorMessage?: string;
}

export interface MetricsSummary {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  responseTimeStats: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  requestsPerSecond: number;
  duration: number;
}

export class MetricsCollector extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private startTime: number = 0;

  start(): void {
    this.startTime = performance.now();
    this.metrics = [];
    this.emit('start');
  }

  recordRequest(
    responseTime: number,
    status: 'success' | 'error',
    requestId?: string,
    errorMessage?: string
  ): void {
    const metric: PerformanceMetric = {
      timestamp: performance.now(),
      responseTime,
      status,
      requestId,
      errorMessage,
    };

    this.metrics.push(metric);
    this.emit('metric', metric);
  }

  getSummary(): MetricsSummary {
    const totalRequests = this.metrics.length;
    const successCount = this.metrics.filter(
      m => m.status === 'success'
    ).length;
    const errorCount = totalRequests - successCount;
    const successRate =
      totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;

    const responseTimes = this.metrics
      .map(m => m.responseTime)
      .sort((a, b) => a - b);
    const responseTimeStats = this.calculatePercentiles(responseTimes);

    const duration = (performance.now() - this.startTime) / 1000; // seconds
    const requestsPerSecond = duration > 0 ? totalRequests / duration : 0;

    return {
      totalRequests,
      successCount,
      errorCount,
      successRate,
      responseTimeStats,
      requestsPerSecond,
      duration,
    };
  }

  private calculatePercentiles(
    sortedValues: number[]
  ): MetricsSummary['responseTimeStats'] {
    if (sortedValues.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    const avg =
      sortedValues.reduce((sum, val) => sum + val, 0) / sortedValues.length;

    const p50Index = Math.floor(sortedValues.length * 0.5);
    const p95Index = Math.floor(sortedValues.length * 0.95);
    const p99Index = Math.floor(sortedValues.length * 0.99);

    return {
      min,
      max,
      avg: Math.round(avg * 100) / 100,
      p50: sortedValues[p50Index],
      p95: sortedValues[p95Index],
      p99: sortedValues[p99Index],
    };
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  reset(): void {
    this.metrics = [];
    this.startTime = 0;
    this.emit('reset');
  }

  exportToCsv(): string {
    const headers = 'timestamp,responseTime,status,requestId,errorMessage';
    const rows = this.metrics.map(
      m =>
        `${m.timestamp},${m.responseTime},${m.status},${m.requestId || ''},${m.errorMessage || ''}`
    );
    return [headers, ...rows].join('\n');
  }

  exportToJson(): string {
    return JSON.stringify(
      {
        summary: this.getSummary(),
        metrics: this.metrics,
      },
      null,
      2
    );
  }
}

export class PerformanceTimer {
  private startTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    return Math.round((performance.now() - this.startTime) * 100) / 100;
  }
}

export function formatMetricsSummary(summary: MetricsSummary): string {
  return `
📊 Performance Summary
───────────────────────────────────────
Total Requests:     ${summary.totalRequests}
Success Rate:       ${summary.successRate.toFixed(2)}% (${summary.successCount}/${summary.totalRequests})
Error Rate:         ${(100 - summary.successRate).toFixed(2)}% (${summary.errorCount}/${summary.totalRequests})

📈 Response Time (ms)
───────────────────────────────────────
Min:               ${summary.responseTimeStats.min}
Max:               ${summary.responseTimeStats.max}
Average:           ${summary.responseTimeStats.avg}
P50 (Median):      ${summary.responseTimeStats.p50}
P95:               ${summary.responseTimeStats.p95}
P99:               ${summary.responseTimeStats.p99}

⚡ Throughput
───────────────────────────────────────
Requests/Second:   ${summary.requestsPerSecond.toFixed(2)}
Total Duration:    ${summary.duration.toFixed(2)}s
`;
}
