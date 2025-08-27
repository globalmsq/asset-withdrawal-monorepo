import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { apiClient } from '../utils/api-client';
import { requestCommand } from './request';
import { errorCommand } from './error';
import fs from 'fs/promises';
import path from 'path';

interface BatchCommandOptions {
  scenario: string;
  requests: string;
  duration?: string;
  report: boolean;
  json: boolean;
  csv: boolean;
}

interface ScenarioResult {
  scenario: string;
  startTime: Date;
  endTime: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errors: any[];
  metrics: {
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    throughput: number;
    successRate: number;
  };
}

export async function batchCommand(
  options: BatchCommandOptions
): Promise<void> {
  const requestCount = parseInt(options.requests, 10);
  const duration = options.duration
    ? parseInt(options.duration, 10) * 1000
    : null;

  console.log(chalk.magenta(`\n🎯 Running ${options.scenario} scenario\n`));

  const scenarios: Record<string, () => Promise<ScenarioResult>> = {
    'normal-flow': () => runNormalFlow(requestCount),
    'stress-test': () => runStressTest(requestCount, duration),
    'error-recovery': () => runErrorRecovery(requestCount),
    mixed: () => runMixedScenario(requestCount),
  };

  const scenario = scenarios[options.scenario];
  if (!scenario) {
    console.error(chalk.red(`Unknown scenario: ${options.scenario}`));
    console.log('Available scenarios:', Object.keys(scenarios).join(', '));
    process.exit(1);
  }

  const spinner = ora('Initializing scenario...').start();

  try {
    const result = await scenario();
    spinner.succeed('Scenario completed');

    // Display results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displayScenarioResults(result);
    }

    // Generate report if requested
    if (options.report) {
      await generateReport(result, options);
    }
  } catch (error: any) {
    spinner.fail(`Scenario failed: ${error.message}`);
    process.exit(1);
  }
}

async function runNormalFlow(count: number): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    scenario: 'normal-flow',
    startTime: new Date(),
    endTime: new Date(),
    totalRequests: count,
    successfulRequests: 0,
    failedRequests: 0,
    errors: [],
    metrics: {
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      throughput: 0,
      successRate: 0,
    },
  };

  const responseTimes: number[] = [];

  console.log(chalk.gray('Simulating normal withdrawal flow...\n'));

  for (let i = 0; i < count; i++) {
    const startTime = Date.now();

    try {
      const response = await apiClient.createWithdrawalRequest({
        amount: (Math.random() * 100 + 10).toFixed(2),
        tokenAddress: process.env.DEFAULT_TOKEN!,
        recipientAddress: process.env.TEST_WALLET_ADDRESS!,
        chain: 'localhost',
        network: 'testnet',
      });

      const responseTime = Date.now() - startTime;
      responseTimes.push(responseTime);
      result.successfulRequests++;

      // Update metrics
      result.metrics.minResponseTime = Math.min(
        result.metrics.minResponseTime,
        responseTime
      );
      result.metrics.maxResponseTime = Math.max(
        result.metrics.maxResponseTime,
        responseTime
      );

      console.log(
        chalk.green(
          `✓ Request ${i + 1}/${count} completed in ${responseTime}ms`
        )
      );

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      result.failedRequests++;
      result.errors.push({
        index: i + 1,
        error: error.message,
        timestamp: new Date(),
      });

      console.log(
        chalk.red(`✗ Request ${i + 1}/${count} failed: ${error.message}`)
      );
    }
  }

  result.endTime = new Date();

  // Calculate final metrics
  if (responseTimes.length > 0) {
    result.metrics.avgResponseTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  const durationSeconds =
    (result.endTime.getTime() - result.startTime.getTime()) / 1000;
  result.metrics.throughput = result.successfulRequests / durationSeconds;
  result.metrics.successRate =
    (result.successfulRequests / result.totalRequests) * 100;

  return result;
}

async function runStressTest(
  count: number,
  duration: number | null
): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    scenario: 'stress-test',
    startTime: new Date(),
    endTime: new Date(),
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    errors: [],
    metrics: {
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      throughput: 0,
      successRate: 0,
    },
  };

  console.log(chalk.gray('Running stress test with concurrent requests...\n'));

  const endTime = duration ? Date.now() + duration : Date.now() + count * 100; // Estimate based on count

  const promises: Promise<void>[] = [];
  let requestIndex = 0;

  // Send requests concurrently
  while (Date.now() < endTime && requestIndex < count) {
    const index = requestIndex++;

    promises.push(
      (async () => {
        const startTime = Date.now();
        try {
          await apiClient.createWithdrawalRequest({
            amount: '10',
            tokenAddress: process.env.DEFAULT_TOKEN!,
            recipientAddress: process.env.TEST_WALLET_ADDRESS!,
            chain: 'localhost',
            network: 'testnet',
          });

          result.successfulRequests++;
          const responseTime = Date.now() - startTime;
          result.metrics.minResponseTime = Math.min(
            result.metrics.minResponseTime,
            responseTime
          );
          result.metrics.maxResponseTime = Math.max(
            result.metrics.maxResponseTime,
            responseTime
          );
        } catch (error: any) {
          result.failedRequests++;
          result.errors.push({ index, error: error.message });
        }
      })()
    );

    // Control concurrency
    if (promises.length >= 10) {
      await Promise.race(promises);
      promises.splice(0, 1);
    }
  }

  // Wait for all remaining requests
  await Promise.all(promises);

  result.endTime = new Date();
  result.totalRequests = requestIndex;

  const durationSeconds =
    (result.endTime.getTime() - result.startTime.getTime()) / 1000;
  result.metrics.throughput = result.successfulRequests / durationSeconds;
  result.metrics.successRate =
    (result.successfulRequests / result.totalRequests) * 100;

  return result;
}

async function runErrorRecovery(count: number): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    scenario: 'error-recovery',
    startTime: new Date(),
    endTime: new Date(),
    totalRequests: count,
    successfulRequests: 0,
    failedRequests: 0,
    errors: [],
    metrics: {
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      throughput: 0,
      successRate: 0,
    },
  };

  console.log(chalk.gray('Testing error recovery mechanisms...\n'));

  // Inject errors and try recovery
  const errorTypes = ['invalid-token', 'malformed-message', 'network-delay'];

  for (let i = 0; i < count; i++) {
    const shouldError = Math.random() < 0.3; // 30% error rate

    if (shouldError) {
      // Inject error
      const errorType =
        errorTypes[Math.floor(Math.random() * errorTypes.length)];
      console.log(chalk.yellow(`🔥 Injecting ${errorType} error...`));

      try {
        await errorCommand({
          type: errorType,
          severity: 'medium',
          count: '1',
          json: false,
        });
        result.errors.push({ type: errorType, recovered: true });
      } catch (error) {
        result.errors.push({ type: errorType, recovered: false });
      }
    }

    // Try normal request
    try {
      await apiClient.createWithdrawalRequest({
        amount: '50',
        tokenAddress: process.env.DEFAULT_TOKEN!,
        recipientAddress: process.env.TEST_WALLET_ADDRESS!,
        chain: 'localhost',
        network: 'testnet',
      });
      result.successfulRequests++;
    } catch (error) {
      result.failedRequests++;
    }
  }

  result.endTime = new Date();
  result.metrics.successRate =
    (result.successfulRequests / result.totalRequests) * 100;

  return result;
}

async function runMixedScenario(count: number): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    scenario: 'mixed',
    startTime: new Date(),
    endTime: new Date(),
    totalRequests: count,
    successfulRequests: 0,
    failedRequests: 0,
    errors: [],
    metrics: {
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      throughput: 0,
      successRate: 0,
    },
  };

  console.log(chalk.gray('Running mixed scenario with various patterns...\n'));

  // Mix of normal, burst, and error scenarios
  const phases = [
    { type: 'normal', count: Math.floor(count * 0.4) },
    { type: 'burst', count: Math.floor(count * 0.3) },
    { type: 'error', count: Math.floor(count * 0.2) },
    { type: 'normal', count: Math.ceil(count * 0.1) },
  ];

  for (const phase of phases) {
    console.log(
      chalk.cyan(`\n🎭 Phase: ${phase.type} (${phase.count} requests)\n`)
    );

    if (phase.type === 'normal') {
      const phaseResult = await runNormalFlow(phase.count);
      result.successfulRequests += phaseResult.successfulRequests;
      result.failedRequests += phaseResult.failedRequests;
    } else if (phase.type === 'burst') {
      const phaseResult = await runStressTest(phase.count, null);
      result.successfulRequests += phaseResult.successfulRequests;
      result.failedRequests += phaseResult.failedRequests;
    } else if (phase.type === 'error') {
      const phaseResult = await runErrorRecovery(phase.count);
      result.successfulRequests += phaseResult.successfulRequests;
      result.failedRequests += phaseResult.failedRequests;
      result.errors.push(...phaseResult.errors);
    }
  }

  result.endTime = new Date();
  result.metrics.successRate =
    (result.successfulRequests / result.totalRequests) * 100;

  return result;
}

function displayScenarioResults(result: ScenarioResult): void {
  console.log(chalk.magenta(`\n🎯 Scenario Results: ${result.scenario}\n`));

  const table = new Table({
    style: { head: ['cyan'] },
  });

  table.push(
    [
      'Duration',
      `${((result.endTime.getTime() - result.startTime.getTime()) / 1000).toFixed(2)}s`,
    ],
    ['Total Requests', result.totalRequests],
    ['Successful', chalk.green(result.successfulRequests)],
    ['Failed', chalk.red(result.failedRequests)],
    ['Success Rate', `${result.metrics.successRate.toFixed(2)}%`],
    ['Throughput', `${result.metrics.throughput.toFixed(2)} req/s`]
  );

  if (result.metrics.avgResponseTime > 0) {
    table.push(
      ['Avg Response Time', `${result.metrics.avgResponseTime.toFixed(2)}ms`],
      ['Min Response Time', `${result.metrics.minResponseTime}ms`],
      ['Max Response Time', `${result.metrics.maxResponseTime}ms`]
    );
  }

  console.log(table.toString());

  if (result.errors.length > 0) {
    console.log(
      chalk.red(`\n⚠️  ${result.errors.length} errors occurred during scenario`)
    );
  }
}

async function generateReport(
  result: ScenarioResult,
  options: BatchCommandOptions
): Promise<void> {
  const reportDir = path.join(process.cwd(), 'reports');
  await fs.mkdir(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const baseFilename = `${result.scenario}-${timestamp}`;

  if (options.json) {
    const jsonPath = path.join(reportDir, `${baseFilename}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(chalk.green(`\n💾 JSON report saved to: ${jsonPath}`));
  }

  if (options.csv) {
    const csvPath = path.join(reportDir, `${baseFilename}.csv`);
    const csvContent = generateCSV(result);
    await fs.writeFile(csvPath, csvContent);
    console.log(chalk.green(`💾 CSV report saved to: ${csvPath}`));
  }

  // Always generate markdown report
  const mdPath = path.join(reportDir, `${baseFilename}.md`);
  const mdContent = generateMarkdown(result);
  await fs.writeFile(mdPath, mdContent);
  console.log(chalk.green(`💾 Markdown report saved to: ${mdPath}`));
}

function generateCSV(result: ScenarioResult): string {
  const lines: string[] = [];

  lines.push('Metric,Value');
  lines.push(`Scenario,${result.scenario}`);
  lines.push(`Start Time,${result.startTime.toISOString()}`);
  lines.push(`End Time,${result.endTime.toISOString()}`);
  lines.push(`Total Requests,${result.totalRequests}`);
  lines.push(`Successful Requests,${result.successfulRequests}`);
  lines.push(`Failed Requests,${result.failedRequests}`);
  lines.push(`Success Rate,${result.metrics.successRate.toFixed(2)}%`);
  lines.push(`Throughput,${result.metrics.throughput.toFixed(2)} req/s`);
  lines.push(
    `Avg Response Time,${result.metrics.avgResponseTime.toFixed(2)}ms`
  );
  lines.push(`Min Response Time,${result.metrics.minResponseTime}ms`);
  lines.push(`Max Response Time,${result.metrics.maxResponseTime}ms`);

  return lines.join('\n');
}

function generateMarkdown(result: ScenarioResult): string {
  const duration =
    (result.endTime.getTime() - result.startTime.getTime()) / 1000;

  return `# Test Report: ${result.scenario}

## Summary
- **Date**: ${result.startTime.toISOString()}
- **Duration**: ${duration.toFixed(2)}s
- **Total Requests**: ${result.totalRequests}
- **Successful**: ${result.successfulRequests}
- **Failed**: ${result.failedRequests}

## Metrics
- **Success Rate**: ${result.metrics.successRate.toFixed(2)}%
- **Throughput**: ${result.metrics.throughput.toFixed(2)} req/s
- **Avg Response Time**: ${result.metrics.avgResponseTime.toFixed(2)}ms
- **Min Response Time**: ${result.metrics.minResponseTime}ms
- **Max Response Time**: ${result.metrics.maxResponseTime}ms

## Errors
Total errors: ${result.errors.length}

${result.errors
  .slice(0, 10)
  .map((e, i) => `${i + 1}. ${e.error || e.type || 'Unknown error'}`)
  .join('\n')}
`;
}
