import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { apiClient } from '../utils/api-client';
import {
  MetricsCollector,
  PerformanceTimer,
  formatMetricsSummary,
} from '../utils/metrics';
import { writeFile } from 'fs/promises';
import { join } from 'path';

interface PerformanceCommandOptions {
  type: string;
  requests?: string;
  concurrency?: string;
  duration?: string;
  output?: string;
  json: boolean;
  csv: boolean;
  report: boolean;
}

interface PerformanceTestResult {
  testType: string;
  configuration: any;
  results: any;
  summary: any;
  timestamp: string;
}

export async function performanceCommand(
  options: PerformanceCommandOptions
): Promise<void> {
  const metrics = new MetricsCollector();
  const results: PerformanceTestResult[] = [];

  console.log(chalk.magenta(`\n⚡ Performance Benchmark Test\n`));
  console.log(chalk.gray(`Test Type: ${options.type}`));
  if (options.requests)
    console.log(chalk.gray(`Requests: ${options.requests}`));
  if (options.concurrency)
    console.log(chalk.gray(`Concurrency: ${options.concurrency}`));
  if (options.duration)
    console.log(chalk.gray(`Duration: ${options.duration}s`));
  console.log();

  metrics.start();

  const testTypes = {
    throughput: async () =>
      await testThroughput(
        parseInt(options.requests || '100'),
        parseInt(options.concurrency || '10')
      ),
    latency: async () => await testLatency(parseInt(options.requests || '50')),
    load: async () =>
      await testLoad(
        parseInt(options.duration || '30'),
        parseInt(options.concurrency || '5')
      ),
    stress: async () =>
      await testStress(
        parseInt(options.duration || '60'),
        parseInt(options.concurrency || '20')
      ),
    endurance: async () =>
      await testEndurance(
        parseInt(options.duration || '300'), // 5 minutes
        parseInt(options.requests || '1000')
      ),
    baseline: async () => await testBaseline(),
  };

  if (!testTypes[options.type as keyof typeof testTypes]) {
    console.error(chalk.red(`Unknown test type: ${options.type}`));
    console.log('Available types:', Object.keys(testTypes).join(', '));
    process.exit(1);
  }

  try {
    const timer = new PerformanceTimer();
    timer.start();

    const result = await testTypes[options.type as keyof typeof testTypes]();
    const duration = timer.stop();

    const testResult: PerformanceTestResult = {
      testType: options.type,
      configuration: {
        requests: options.requests,
        concurrency: options.concurrency,
        duration: options.duration,
      },
      results: result,
      summary: metrics.getSummary(),
      timestamp: new Date().toISOString(),
    };

    results.push(testResult);

    console.log(
      chalk.green(`✅ ${options.type} test completed (${duration}ms)`)
    );

    if (options.json) {
      console.log(JSON.stringify(testResult, null, 2));
    } else {
      displayPerformanceResult(testResult);
    }

    // Save results if output specified
    if (options.output) {
      await saveResults(testResult, options);
    }
  } catch (error: any) {
    console.error(
      chalk.red(`❌ ${options.type} test failed: ${error.message}`)
    );
  }

  if (options.report) {
    console.log(chalk.cyan('\n📊 Overall Performance Report:'));
    console.log(formatMetricsSummary(metrics.getSummary()));
  }
}

async function testThroughput(
  totalRequests: number,
  concurrency: number
): Promise<any> {
  const spinner = ora(
    `Testing throughput: ${totalRequests} requests with ${concurrency} concurrent...`
  ).start();

  const metrics = new MetricsCollector();
  metrics.start();

  const requests = [];
  const results = [];

  for (let batch = 0; batch < Math.ceil(totalRequests / concurrency); batch++) {
    const batchRequests = [];
    const batchSize = Math.min(
      concurrency,
      totalRequests - batch * concurrency
    );

    for (let i = 0; i < batchSize; i++) {
      const timer = new PerformanceTimer();
      timer.start();

      batchRequests.push(
        apiClient
          .createWithdrawalRequest({
            amount: '1',
            tokenAddress: process.env.DEFAULT_TOKEN!,
            recipientAddress: process.env.TEST_WALLET_ADDRESS!,
            chain: 'localhost',
            network: 'testnet',
          })
          .then(response => {
            const responseTime = timer.stop();
            metrics.recordRequest(responseTime, 'success', response.id);
            return { success: true, requestId: response.id, responseTime };
          })
          .catch(error => {
            const responseTime = timer.stop();
            metrics.recordRequest(
              responseTime,
              'error',
              undefined,
              error.message
            );
            return { success: false, error: error.message, responseTime };
          })
      );
    }

    const batchResults = await Promise.allSettled(batchRequests);
    results.push(...batchResults);

    // Small delay between batches to avoid overwhelming the system
    if (batch < Math.ceil(totalRequests / concurrency) - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const summary = metrics.getSummary();

  spinner.succeed(
    `Throughput test completed: ${summary.requestsPerSecond.toFixed(2)} RPS`
  );

  return {
    totalRequests,
    concurrency,
    throughput: summary.requestsPerSecond,
    successRate: summary.successRate,
    responseTimeStats: summary.responseTimeStats,
    duration: summary.duration,
  };
}

async function testLatency(requests: number): Promise<any> {
  const spinner = ora(
    `Testing latency: ${requests} sequential requests...`
  ).start();

  const metrics = new MetricsCollector();
  metrics.start();

  const results = [];

  for (let i = 0; i < requests; i++) {
    const timer = new PerformanceTimer();
    timer.start();

    try {
      const response = await apiClient.createWithdrawalRequest({
        amount: '1',
        tokenAddress: process.env.DEFAULT_TOKEN!,
        recipientAddress: process.env.TEST_WALLET_ADDRESS!,
        chain: 'localhost',
        network: 'testnet',
      });

      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'success', response.id);
      results.push({ success: true, responseTime, requestId: response.id });
    } catch (error: any) {
      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'error', undefined, error.message);
      results.push({ success: false, responseTime, error: error.message });
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const summary = metrics.getSummary();

  spinner.succeed(
    `Latency test completed: P50=${summary.responseTimeStats.p50}ms, P95=${summary.responseTimeStats.p95}ms`
  );

  return {
    totalRequests: requests,
    responseTimeStats: summary.responseTimeStats,
    successRate: summary.successRate,
    consistency: {
      standardDeviation: calculateStandardDeviation(
        results.filter(r => r.success).map(r => r.responseTime)
      ),
      range: summary.responseTimeStats.max - summary.responseTimeStats.min,
    },
  };
}

async function testLoad(
  durationSeconds: number,
  concurrency: number
): Promise<any> {
  const spinner = ora(
    `Load testing: ${concurrency} concurrent users for ${durationSeconds}s...`
  ).start();

  const metrics = new MetricsCollector();
  metrics.start();

  const endTime = Date.now() + durationSeconds * 1000;
  const workers = [];

  // Start concurrent workers
  for (let i = 0; i < concurrency; i++) {
    workers.push(runLoadWorker(i, endTime, metrics));
  }

  await Promise.all(workers);

  const summary = metrics.getSummary();

  spinner.succeed(
    `Load test completed: ${summary.requestsPerSecond.toFixed(2)} RPS with ${summary.successRate.toFixed(1)}% success rate`
  );

  return {
    duration: durationSeconds,
    concurrency,
    totalRequests: summary.totalRequests,
    throughput: summary.requestsPerSecond,
    successRate: summary.successRate,
    responseTimeStats: summary.responseTimeStats,
  };
}

async function testStress(
  durationSeconds: number,
  concurrency: number
): Promise<any> {
  const spinner = ora(
    `Stress testing: ${concurrency} concurrent users for ${durationSeconds}s...`
  ).start();

  // Stress test with higher concurrency and no delays
  const metrics = new MetricsCollector();
  metrics.start();

  const endTime = Date.now() + durationSeconds * 1000;
  const workers = [];

  // Start aggressive concurrent workers
  for (let i = 0; i < concurrency; i++) {
    workers.push(runStressWorker(i, endTime, metrics));
  }

  await Promise.all(workers);

  const summary = metrics.getSummary();

  spinner.succeed(
    `Stress test completed: ${summary.requestsPerSecond.toFixed(2)} RPS with ${summary.successRate.toFixed(1)}% success rate`
  );

  return {
    duration: durationSeconds,
    concurrency,
    totalRequests: summary.totalRequests,
    throughput: summary.requestsPerSecond,
    successRate: summary.successRate,
    responseTimeStats: summary.responseTimeStats,
    systemStress: {
      peakThroughput: summary.requestsPerSecond,
      errorRate: 100 - summary.successRate,
      breakdown:
        summary.errorCount > 0
          ? 'System showed stress symptoms'
          : 'System handled load well',
    },
  };
}

async function testEndurance(
  durationSeconds: number,
  totalRequests: number
): Promise<any> {
  const spinner = ora(
    `Endurance testing: ${totalRequests} requests over ${durationSeconds}s...`
  ).start();

  const metrics = new MetricsCollector();
  metrics.start();

  const interval = (durationSeconds * 1000) / totalRequests; // ms between requests
  const results = [];

  for (let i = 0; i < totalRequests; i++) {
    const timer = new PerformanceTimer();
    timer.start();

    try {
      const response = await apiClient.createWithdrawalRequest({
        amount: '1',
        tokenAddress: process.env.DEFAULT_TOKEN!,
        recipientAddress: process.env.TEST_WALLET_ADDRESS!,
        chain: 'localhost',
        network: 'testnet',
      });

      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'success', response.id);
      results.push({ success: true, responseTime, timestamp: Date.now() });
    } catch (error: any) {
      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'error', undefined, error.message);
      results.push({
        success: false,
        responseTime,
        error: error.message,
        timestamp: Date.now(),
      });
    }

    // Maintain steady interval
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  const summary = metrics.getSummary();

  // Check for performance degradation over time
  const firstHalf = results.slice(0, Math.floor(results.length / 2));
  const secondHalf = results.slice(Math.floor(results.length / 2));

  const firstHalfAvg =
    firstHalf.reduce((sum, r) => sum + r.responseTime, 0) / firstHalf.length;
  const secondHalfAvg =
    secondHalf.reduce((sum, r) => sum + r.responseTime, 0) / secondHalf.length;
  const degradation = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

  spinner.succeed(
    `Endurance test completed: ${degradation > 0 ? '+' : ''}${degradation.toFixed(1)}% latency change`
  );

  return {
    duration: durationSeconds,
    totalRequests,
    averageInterval: interval,
    successRate: summary.successRate,
    responseTimeStats: summary.responseTimeStats,
    performanceDrift: {
      firstHalfAvgMs: firstHalfAvg,
      secondHalfAvgMs: secondHalfAvg,
      degradationPercentage: degradation,
      stable: Math.abs(degradation) < 20, // Less than 20% change considered stable
    },
  };
}

async function testBaseline(): Promise<any> {
  const spinner = ora('Establishing baseline performance...').start();

  const metrics = new MetricsCollector();
  metrics.start();

  // Single request to establish baseline
  const timer = new PerformanceTimer();
  timer.start();

  try {
    const response = await apiClient.createWithdrawalRequest({
      amount: '1',
      tokenAddress: process.env.DEFAULT_TOKEN!,
      recipientAddress: process.env.TEST_WALLET_ADDRESS!,
      chain: 'localhost',
      network: 'testnet',
    });

    const responseTime = timer.stop();
    metrics.recordRequest(responseTime, 'success', response.id);

    spinner.succeed(`Baseline established: ${responseTime}ms response time`);

    return {
      baselineResponseTime: responseTime,
      requestId: response.id,
      timestamp: new Date().toISOString(),
      systemLoad: await getSystemLoad(),
    };
  } catch (error: any) {
    const responseTime = timer.stop();
    metrics.recordRequest(responseTime, 'error', undefined, error.message);

    spinner.fail('Baseline test failed');
    throw error;
  }
}

async function runLoadWorker(
  workerId: number,
  endTime: number,
  metrics: MetricsCollector
): Promise<void> {
  while (Date.now() < endTime) {
    const timer = new PerformanceTimer();
    timer.start();

    try {
      const response = await apiClient.createWithdrawalRequest({
        amount: '1',
        tokenAddress: process.env.DEFAULT_TOKEN!,
        recipientAddress: process.env.TEST_WALLET_ADDRESS!,
        chain: 'localhost',
        network: 'testnet',
      });

      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'success', response.id);
    } catch (error: any) {
      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'error', undefined, error.message);
    }

    // Brief pause between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

async function runStressWorker(
  workerId: number,
  endTime: number,
  metrics: MetricsCollector
): Promise<void> {
  while (Date.now() < endTime) {
    const timer = new PerformanceTimer();
    timer.start();

    try {
      const response = await apiClient.createWithdrawalRequest({
        amount: '1',
        tokenAddress: process.env.DEFAULT_TOKEN!,
        recipientAddress: process.env.TEST_WALLET_ADDRESS!,
        chain: 'localhost',
        network: 'testnet',
      });

      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'success', response.id);
    } catch (error: any) {
      const responseTime = timer.stop();
      metrics.recordRequest(responseTime, 'error', undefined, error.message);
    }

    // No delay for stress testing - maximum pressure
  }
}

async function getSystemLoad(): Promise<any> {
  try {
    // Get system health from various services
    const healthChecks = await Promise.allSettled([
      axios.get(`${process.env.API_URL || 'http://localhost:3000'}/health`),
      axios.get(
        `${process.env.SIGNING_SERVICE_URL || 'http://localhost:3002'}/health`
      ),
      axios.get(
        `${process.env.TX_MONITOR_URL || 'http://localhost:3003'}/health`
      ),
      axios.get(
        `${process.env.TX_BROADCASTER_URL || 'http://localhost:3004'}/health`
      ),
    ]);

    const serviceHealth = healthChecks.map((result, index) => ({
      service: [
        'api-server',
        'signing-service',
        'tx-monitor',
        'tx-broadcaster',
      ][index],
      status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
      data: result.status === 'fulfilled' ? result.value.data : null,
    }));

    return {
      timestamp: new Date().toISOString(),
      services: serviceHealth,
      healthyServices: serviceHealth.filter(s => s.status === 'healthy').length,
      totalServices: serviceHealth.length,
    };
  } catch (error) {
    return {
      timestamp: new Date().toISOString(),
      error: 'Could not retrieve system load',
      services: [],
    };
  }
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
  const variance =
    squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;

  return Math.sqrt(variance);
}

async function saveResults(
  result: PerformanceTestResult,
  options: PerformanceCommandOptions
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename =
    options.output || `performance-${result.testType}-${timestamp}`;

  if (options.csv) {
    // Save as CSV
    const csvContent = generateCsvReport(result);
    await writeFile(join(process.cwd(), `${filename}.csv`), csvContent);
    console.log(chalk.blue(`📄 Results saved to: ${filename}.csv`));
  } else {
    // Save as JSON
    await writeFile(
      join(process.cwd(), `${filename}.json`),
      JSON.stringify(result, null, 2)
    );
    console.log(chalk.blue(`📄 Results saved to: ${filename}.json`));
  }
}

function generateCsvReport(result: PerformanceTestResult): string {
  const headers =
    'testType,timestamp,duration,totalRequests,successRate,throughput,avgResponseTime,p50,p95,p99';
  const data = [
    result.testType,
    result.timestamp,
    result.summary.duration,
    result.summary.totalRequests,
    result.summary.successRate,
    result.summary.requestsPerSecond,
    result.summary.responseTimeStats.avg,
    result.summary.responseTimeStats.p50,
    result.summary.responseTimeStats.p95,
    result.summary.responseTimeStats.p99,
  ].join(',');

  return [headers, data].join('\n');
}

function displayPerformanceResult(result: PerformanceTestResult): void {
  console.log(chalk.magenta('\n⚡ Performance Test Results:\n'));

  console.log(`  Test Type: ${chalk.yellow(result.testType)}`);
  console.log(
    `  Duration: ${chalk.blue(result.summary.duration.toFixed(2) + 's')}`
  );
  console.log(`  Total Requests: ${chalk.blue(result.summary.totalRequests)}`);
  console.log(
    `  Success Rate: ${chalk.green(result.summary.successRate.toFixed(1) + '%')}`
  );
  console.log(
    `  Throughput: ${chalk.yellow(result.summary.requestsPerSecond.toFixed(2) + ' RPS')}`
  );

  console.log(chalk.cyan('\n  📈 Response Time Distribution:'));
  console.log(
    `    Average: ${chalk.blue(result.summary.responseTimeStats.avg + 'ms')}`
  );
  console.log(
    `    P50 (Median): ${chalk.blue(result.summary.responseTimeStats.p50 + 'ms')}`
  );
  console.log(
    `    P95: ${chalk.yellow(result.summary.responseTimeStats.p95 + 'ms')}`
  );
  console.log(
    `    P99: ${chalk.red(result.summary.responseTimeStats.p99 + 'ms')}`
  );
  console.log(
    `    Min/Max: ${chalk.green(result.summary.responseTimeStats.min)}/${chalk.red(result.summary.responseTimeStats.max)}ms`
  );

  if (result.results.performanceDrift) {
    console.log(chalk.cyan('\n  📊 Performance Stability:'));
    const drift = result.results.performanceDrift;
    console.log(
      `    First Half Avg: ${chalk.blue(drift.firstHalfAvgMs.toFixed(1) + 'ms')}`
    );
    console.log(
      `    Second Half Avg: ${chalk.blue(drift.secondHalfAvgMs.toFixed(1) + 'ms')}`
    );
    console.log(
      `    Performance Drift: ${drift.degradationPercentage > 0 ? chalk.red('+') : chalk.green('')}${chalk.yellow(drift.degradationPercentage.toFixed(1) + '%')}`
    );
    console.log(
      `    Stability: ${drift.stable ? chalk.green('✅ Stable') : chalk.red('❌ Degraded')}`
    );
  }

  if (result.results.systemStress) {
    console.log(chalk.cyan('\n  🔥 System Stress Analysis:'));
    const stress = result.results.systemStress;
    console.log(
      `    Peak Throughput: ${chalk.blue(stress.peakThroughput.toFixed(2) + ' RPS')}`
    );
    console.log(
      `    Error Rate: ${chalk.yellow(stress.errorRate.toFixed(1) + '%')}`
    );
    console.log(`    Assessment: ${chalk.gray(stress.breakdown)}`);
  }
}
