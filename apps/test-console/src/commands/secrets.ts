import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import {
  MetricsCollector,
  PerformanceTimer,
  formatMetricsSummary,
} from '../utils/metrics';

interface SecretsCommandOptions {
  scenario: string;
  duration?: string;
  count?: string;
  severity?: string;
  json: boolean;
  report: boolean;
}

interface SecretsTestResult {
  scenario: string;
  success: boolean;
  duration: number;
  details: any;
  timestamp: string;
  error?: string;
}

export async function secretsCommand(
  options: SecretsCommandOptions
): Promise<void> {
  const metrics = new MetricsCollector();
  const results: SecretsTestResult[] = [];

  console.log(chalk.magenta(`\n🔐 AWS Secrets Manager Test\n`));
  console.log(chalk.gray(`Scenario: ${options.scenario}`));
  if (options.severity)
    console.log(chalk.gray(`Severity: ${options.severity}`));
  console.log();

  metrics.start();

  const scenarios = {
    'access-failure': async () => await testAccessFailure(),
    'key-rotation': async () => await testKeyRotation(),
    'dlq-failover': async () => await testDlqFailover(),
    'timeout-simulation': async () =>
      await testTimeoutScenario(parseInt(options.duration || '5000')),
    'permission-denied': async () => await testPermissionDenied(),
    'service-unavailable': async () => await testServiceUnavailable(),
    'batch-failure': async () =>
      await testBatchSecretsFailure(parseInt(options.count || '5')),
  };

  if (!scenarios[options.scenario as keyof typeof scenarios]) {
    console.error(chalk.red(`Unknown scenario: ${options.scenario}`));
    console.log('Available scenarios:', Object.keys(scenarios).join(', '));
    process.exit(1);
  }

  try {
    const timer = new PerformanceTimer();
    timer.start();

    const result =
      await scenarios[options.scenario as keyof typeof scenarios]();
    const duration = timer.stop();

    metrics.recordRequest(duration, 'success');

    results.push({
      scenario: options.scenario,
      success: true,
      duration,
      details: result,
      timestamp: new Date().toISOString(),
    });

    console.log(chalk.green(`✅ ${options.scenario} scenario completed`));

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displaySecretsResult(result);
    }
  } catch (error: any) {
    const timer = new PerformanceTimer();
    const duration = timer.stop();

    metrics.recordRequest(duration, 'error', undefined, error.message);

    results.push({
      scenario: options.scenario,
      success: false,
      duration,
      details: null,
      timestamp: new Date().toISOString(),
      error: error.message,
    });

    console.error(
      chalk.red(`❌ ${options.scenario} scenario failed: ${error.message}`)
    );
  }

  if (options.report) {
    console.log(chalk.cyan('\n📊 Performance Report:'));
    console.log(formatMetricsSummary(metrics.getSummary()));
  }
}

async function testAccessFailure(): Promise<any> {
  const spinner = ora('Simulating Secrets Manager access failure...').start();

  try {
    // Simulate access failure by sending request to signing service with invalid credentials
    const signingServiceUrl =
      process.env.SIGNING_SERVICE_URL || 'http://localhost:3002';

    // Create a withdrawal request that will trigger secrets access
    const response = await axios.post(
      `${signingServiceUrl}/test/secrets-failure`,
      {
        scenario: 'access-denied',
        awsRegion: process.env.AWS_REGION || 'us-east-1',
      },
      {
        timeout: 10000,
        headers: {
          'X-Test-Mode': 'true', // Indicate this is a test
        },
      }
    );

    spinner.succeed('Secrets access failure simulated');

    return {
      scenario: 'access-failure',
      triggered: true,
      response: response.data,
      dlqRedirection: response.data.dlqRedirection || false,
    };
  } catch (error: any) {
    // Expected to fail - this is testing error handling
    if (
      error.response?.status === 500 &&
      error.response?.data?.error?.includes('secrets')
    ) {
      spinner.succeed('Secrets access failure successfully triggered');
      return {
        scenario: 'access-failure',
        triggered: true,
        expectedError: error.response.data.error,
        dlqRedirection: error.response.data.dlqRedirection || false,
      };
    }

    spinner.fail('Secrets access failure simulation failed');
    throw error;
  }
}

async function testKeyRotation(): Promise<any> {
  const spinner = ora('Testing key rotation scenario...').start();

  try {
    // Simulate key rotation by testing with old/new key scenarios
    const signingServiceUrl =
      process.env.SIGNING_SERVICE_URL || 'http://localhost:3002';

    const response = await axios.post(
      `${signingServiceUrl}/test/key-rotation`,
      {
        scenario: 'mid-rotation',
        keyVersion: 'old',
      },
      {
        timeout: 15000,
        headers: {
          'X-Test-Mode': 'true',
        },
      }
    );

    spinner.succeed('Key rotation scenario completed');

    return {
      scenario: 'key-rotation',
      triggered: true,
      rotationHandled: response.data.rotationHandled || false,
      fallbackUsed: response.data.fallbackUsed || false,
      response: response.data,
    };
  } catch (error: any) {
    if (
      error.response?.status === 500 &&
      error.response?.data?.error?.includes('rotation')
    ) {
      spinner.succeed('Key rotation failure successfully triggered');
      return {
        scenario: 'key-rotation',
        triggered: true,
        expectedError: error.response.data.error,
        fallbackUsed: error.response.data.fallbackUsed || false,
      };
    }

    spinner.fail('Key rotation test failed');
    throw error;
  }
}

async function testDlqFailover(): Promise<any> {
  const spinner = ora('Testing DLQ failover scenario...').start();

  try {
    // Create a request that should trigger DLQ processing
    const apiUrl = process.env.API_URL || 'http://localhost:3000';

    const response = await axios.post(
      `${apiUrl}/api/withdrawal/request`,
      {
        amount: '999999999999', // Extremely high amount to trigger failure
        tokenAddress: '0x0000000000000000000000000000000000000000', // Invalid token
        recipientAddress: '0x0000000000000000000000000000000000000000', // Invalid recipient
        chain: 'localhost',
        network: 'testnet',
      },
      {
        headers: {
          'X-Test-Mode': 'dlq-failover',
          Authorization: `Bearer ${process.env.TEST_JWT_TOKEN}`,
        },
      }
    );

    // Wait for DLQ processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check DLQ status
    const dlqResponse = await axios.get(`${apiUrl}/api/test/dlq-status`, {
      headers: {
        Authorization: `Bearer ${process.env.TEST_JWT_TOKEN}`,
      },
    });

    spinner.succeed('DLQ failover test completed');

    return {
      scenario: 'dlq-failover',
      originalRequestId: response.data.requestId,
      dlqStatus: dlqResponse.data,
      failoverTriggered: true,
    };
  } catch (error: any) {
    // Check if error indicates DLQ processing
    if (error.response?.status === 400 || error.response?.status === 422) {
      spinner.succeed('DLQ failover triggered (validation error as expected)');
      return {
        scenario: 'dlq-failover',
        triggered: true,
        validationError: error.response.data.error,
        dlqExpected: true,
      };
    }

    spinner.fail('DLQ failover test failed');
    throw error;
  }
}

async function testTimeoutScenario(timeoutMs: number): Promise<any> {
  const spinner = ora(`Testing timeout scenario (${timeoutMs}ms)...`).start();

  try {
    const signingServiceUrl =
      process.env.SIGNING_SERVICE_URL || 'http://localhost:3002';

    const response = await axios.post(
      `${signingServiceUrl}/test/secrets-timeout`,
      {
        scenario: 'slow-response',
        timeoutMs,
      },
      {
        timeout: timeoutMs + 1000, // Allow slightly more time than the simulated timeout
        headers: {
          'X-Test-Mode': 'true',
        },
      }
    );

    spinner.succeed('Timeout scenario completed');

    return {
      scenario: 'timeout-simulation',
      configuredTimeout: timeoutMs,
      actualDuration: response.data.duration,
      timeoutHandled: response.data.timeoutHandled,
    };
  } catch (error: any) {
    if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
      spinner.succeed('Timeout successfully triggered');
      return {
        scenario: 'timeout-simulation',
        configuredTimeout: timeoutMs,
        timeoutTriggered: true,
        expectedBehavior: true,
      };
    }

    spinner.fail('Timeout scenario failed');
    throw error;
  }
}

async function testPermissionDenied(): Promise<any> {
  const spinner = ora('Testing permission denied scenario...').start();

  try {
    const signingServiceUrl =
      process.env.SIGNING_SERVICE_URL || 'http://localhost:3002';

    const response = await axios.post(
      `${signingServiceUrl}/test/secrets-permission`,
      {
        scenario: 'insufficient-permissions',
        secretName: 'test-private-key',
      },
      {
        timeout: 5000,
        headers: {
          'X-Test-Mode': 'true',
          'X-Simulate-IAM-Failure': 'true', // Custom header to trigger IAM simulation
        },
      }
    );

    spinner.succeed('Permission denied scenario completed');

    return {
      scenario: 'permission-denied',
      permissionError: response.data.permissionError,
      fallbackAttempted: response.data.fallbackAttempted,
    };
  } catch (error: any) {
    if (error.response?.status === 403) {
      spinner.succeed('Permission denied successfully triggered');
      return {
        scenario: 'permission-denied',
        triggered: true,
        errorCode: 403,
        expectedBehavior: true,
      };
    }

    spinner.fail('Permission denied test failed');
    throw error;
  }
}

async function testServiceUnavailable(): Promise<any> {
  const spinner = ora('Testing service unavailable scenario...').start();

  try {
    // Point to non-existent AWS endpoint
    const signingServiceUrl =
      process.env.SIGNING_SERVICE_URL || 'http://localhost:3002';

    const response = await axios.post(
      `${signingServiceUrl}/test/secrets-unavailable`,
      {
        scenario: 'service-down',
        awsEndpoint: 'https://nonexistent.amazonaws.com',
      },
      {
        timeout: 10000,
        headers: {
          'X-Test-Mode': 'true',
        },
      }
    );

    spinner.succeed('Service unavailable scenario completed');

    return {
      scenario: 'service-unavailable',
      serviceDown: response.data.serviceDown,
      retryAttempts: response.data.retryAttempts,
      fallbackUsed: response.data.fallbackUsed,
    };
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      spinner.succeed('Service unavailable successfully triggered');
      return {
        scenario: 'service-unavailable',
        triggered: true,
        errorCode: error.code,
        expectedBehavior: true,
      };
    }

    spinner.fail('Service unavailable test failed');
    throw error;
  }
}

async function testBatchSecretsFailure(count: number): Promise<any> {
  const spinner = ora(
    `Testing batch secrets failure (${count} requests)...`
  ).start();

  try {
    const promises = [];
    const signingServiceUrl =
      process.env.SIGNING_SERVICE_URL || 'http://localhost:3002';

    // Send multiple requests to trigger batch processing failure
    for (let i = 0; i < count; i++) {
      promises.push(
        axios
          .post(
            `${signingServiceUrl}/test/secrets-batch`,
            {
              scenario: 'batch-failure',
              batchIndex: i,
              invalidSecret: i % 3 === 0, // Every 3rd request has invalid secret
            },
            {
              timeout: 5000,
              headers: {
                'X-Test-Mode': 'true',
              },
            }
          )
          .catch(error => ({
            error: error.response?.data || error.message,
            index: i,
          }))
      );
    }

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const errorCount = results.filter(r => r.status === 'rejected').length;

    spinner.succeed(
      `Batch secrets test completed: ${successCount} success, ${errorCount} errors`
    );

    return {
      scenario: 'batch-failure',
      totalRequests: count,
      successCount,
      errorCount,
      successRate: (successCount / count) * 100,
      results: results.map((r, i) => ({
        index: i,
        status: r.status,
        data: r.status === 'fulfilled' ? (r.value as any).data : null,
        error: r.status === 'rejected' ? r.reason.message : null,
      })),
    };
  } catch (error) {
    spinner.fail('Batch secrets test failed');
    throw error;
  }
}

function displaySecretsResult(result: any): void {
  console.log(chalk.magenta('\n🔐 Secrets Manager Test Results:\n'));

  console.log(`  Scenario: ${chalk.yellow(result.scenario)}`);

  if (result.triggered !== undefined) {
    console.log(
      `  Status: ${result.triggered ? chalk.green('✅ Triggered') : chalk.red('❌ Not Triggered')}`
    );
  }

  if (result.expectedBehavior) {
    console.log(`  Expected: ${chalk.green('✅ Behavior as expected')}`);
  }

  if (result.errorCode) {
    console.log(`  Error Code: ${chalk.red(result.errorCode)}`);
  }

  if (result.expectedError) {
    console.log(`  Error Message: ${chalk.gray(result.expectedError)}`);
  }

  if (result.dlqRedirection !== undefined) {
    console.log(
      `  DLQ Redirection: ${result.dlqRedirection ? chalk.green('✅ Yes') : chalk.red('❌ No')}`
    );
  }

  if (result.fallbackUsed !== undefined) {
    console.log(
      `  Fallback Used: ${result.fallbackUsed ? chalk.green('✅ Yes') : chalk.yellow('⚠️ No')}`
    );
  }

  if (result.retryAttempts) {
    console.log(`  Retry Attempts: ${chalk.blue(result.retryAttempts)}`);
  }

  if (result.totalRequests) {
    // Batch test results
    console.log(`  Total Requests: ${chalk.blue(result.totalRequests)}`);
    console.log(`  Success Count: ${chalk.green(result.successCount)}`);
    console.log(`  Error Count: ${chalk.red(result.errorCount)}`);
    console.log(
      `  Success Rate: ${chalk.yellow(result.successRate.toFixed(1) + '%')}`
    );

    console.log(chalk.cyan('\n  Batch Results:'));
    result.results.forEach((r: any) => {
      const status =
        r.status === 'fulfilled' ? chalk.green('✅') : chalk.red('❌');
      console.log(`    ${status} Request ${r.index + 1}`);
      if (r.error) {
        console.log(`      ${chalk.red('Error:')} ${r.error}`);
      }
    });
  }

  if (result.configuredTimeout) {
    console.log(
      `  Configured Timeout: ${chalk.blue(result.configuredTimeout + 'ms')}`
    );
    console.log(
      `  Actual Duration: ${chalk.yellow((result.actualDuration || 'N/A') + 'ms')}`
    );
    console.log(
      `  Timeout Triggered: ${result.timeoutTriggered ? chalk.green('✅ Yes') : chalk.red('❌ No')}`
    );
  }

  if (result.rotationHandled !== undefined) {
    console.log(
      `  Rotation Handled: ${result.rotationHandled ? chalk.green('✅ Yes') : chalk.red('❌ No')}`
    );
  }

  if (result.originalRequestId) {
    console.log(`  Original Request: ${chalk.blue(result.originalRequestId)}`);
  }

  if (result.dlqStatus) {
    console.log(chalk.cyan('\n  DLQ Status:'));
    console.log(
      `    Messages in DLQ: ${chalk.yellow(result.dlqStatus.messageCount || 0)}`
    );
    console.log(
      `    DLQ Processing: ${result.dlqStatus.processing ? chalk.green('Active') : chalk.red('Inactive')}`
    );
  }
}
