import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import WebSocket from 'ws';
import {
  MetricsCollector,
  PerformanceTimer,
  formatMetricsSummary,
} from '../utils/metrics';

interface WebSocketCommandOptions {
  action: string;
  chain?: string;
  duration?: string;
  count?: string;
  json: boolean;
  report: boolean;
}

interface WebSocketTestResult {
  action: string;
  success: boolean;
  duration: number;
  details: any;
  timestamp: string;
  error?: string;
}

export async function websocketCommand(
  options: WebSocketCommandOptions
): Promise<void> {
  const metrics = new MetricsCollector();
  const results: WebSocketTestResult[] = [];

  console.log(chalk.blue(`\n🔌 WebSocket Connection Test\n`));
  console.log(chalk.gray(`Action: ${options.action}`));
  if (options.chain) console.log(chalk.gray(`Chain: ${options.chain}`));
  console.log();

  metrics.start();

  const actions = {
    'test-connection': async () => await testConnection(options.chain),
    disconnect: async () => await testDisconnection(options.chain),
    reconnect: async () => await testReconnection(options.chain),
    'stress-test': async () =>
      await testConnectionStress(
        parseInt(options.count || '10'),
        parseInt(options.duration || '30000')
      ),
    'verify-connection': async () => await verifyConnection(options.chain),
    'monitor-health': async () =>
      await monitorConnectionHealth(parseInt(options.duration || '10000')),
  };

  if (!actions[options.action as keyof typeof actions]) {
    console.error(chalk.red(`Unknown action: ${options.action}`));
    console.log('Available actions:', Object.keys(actions).join(', '));
    process.exit(1);
  }

  try {
    const timer = new PerformanceTimer();
    timer.start();

    const result = await actions[options.action as keyof typeof actions]();
    const duration = timer.stop();

    metrics.recordRequest(duration, 'success');

    results.push({
      action: options.action,
      success: true,
      duration,
      details: result,
      timestamp: new Date().toISOString(),
    });

    console.log(chalk.green(`✅ ${options.action} completed successfully`));

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displayWebSocketResult(result);
    }
  } catch (error: any) {
    const timer = new PerformanceTimer();
    const duration = timer.stop();

    metrics.recordRequest(duration, 'error', undefined, error.message);

    results.push({
      action: options.action,
      success: false,
      duration,
      details: null,
      timestamp: new Date().toISOString(),
      error: error.message,
    });

    console.error(chalk.red(`❌ ${options.action} failed: ${error.message}`));
  }

  if (options.report) {
    console.log(chalk.cyan('\n📊 Performance Report:'));
    console.log(formatMetricsSummary(metrics.getSummary()));
  }
}

async function testConnection(chain?: string): Promise<any> {
  const spinner = ora('Testing WebSocket connection...').start();

  try {
    // Get tx-monitor service status
    const monitorResponse = await axios.get(
      `${process.env.TX_MONITOR_URL || 'http://localhost:3003'}/health`
    );

    if (!monitorResponse.data.websocket) {
      throw new Error('WebSocket service is not running');
    }

    const wsUrl = getWebSocketUrl(chain);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        spinner.succeed('WebSocket connection established');
        ws.close();
        resolve({
          status: 'connected',
          url: wsUrl,
          chain: chain || 'localhost',
        });
      });

      ws.on('error', error => {
        clearTimeout(timeout);
        spinner.fail('WebSocket connection failed');
        reject(error);
      });
    });
  } catch (error) {
    spinner.fail('Connection test failed');
    throw error;
  }
}

async function testDisconnection(chain?: string): Promise<any> {
  const spinner = ora('Testing WebSocket disconnection...').start();

  try {
    const wsUrl = getWebSocketUrl(chain);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        // Force disconnection after establishing connection
        setTimeout(() => {
          ws.terminate(); // Abrupt termination to simulate network failure
          spinner.succeed('WebSocket disconnection simulated');
          resolve({
            status: 'disconnected',
            method: 'forced_termination',
            url: wsUrl,
          });
        }, 1000);
      });

      ws.on('error', error => {
        spinner.fail('Disconnection test failed');
        reject(error);
      });
    });
  } catch (error) {
    spinner.fail('Disconnection test failed');
    throw error;
  }
}

async function testReconnection(chain?: string): Promise<any> {
  const spinner = ora('Testing WebSocket reconnection...').start();

  try {
    // First disconnect, then reconnect
    await testDisconnection(chain);

    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 2000));

    const reconnectResult = await testConnection(chain);
    spinner.succeed('WebSocket reconnection completed');

    return {
      status: 'reconnected',
      reconnectionDelay: 2000,
      ...reconnectResult,
    };
  } catch (error) {
    spinner.fail('Reconnection test failed');
    throw error;
  }
}

async function testConnectionStress(
  connectionCount: number,
  duration: number
): Promise<any> {
  const spinner = ora(
    `Testing ${connectionCount} concurrent connections for ${duration}ms...`
  ).start();

  try {
    const connections: WebSocket[] = [];
    const results: any[] = [];

    const wsUrl = getWebSocketUrl();

    // Create multiple concurrent connections
    for (let i = 0; i < connectionCount; i++) {
      const ws = new WebSocket(wsUrl);
      connections.push(ws);

      ws.on('open', () => {
        results.push({
          connectionId: i,
          status: 'connected',
          timestamp: Date.now(),
        });
      });

      ws.on('error', error => {
        results.push({
          connectionId: i,
          status: 'error',
          error: error.message,
          timestamp: Date.now(),
        });
      });
    }

    // Wait for specified duration
    await new Promise(resolve => setTimeout(resolve, duration));

    // Close all connections
    connections.forEach(ws => ws.terminate());

    spinner.succeed(
      `Stress test completed: ${results.filter(r => r.status === 'connected').length}/${connectionCount} successful`
    );

    return {
      totalConnections: connectionCount,
      successfulConnections: results.filter(r => r.status === 'connected')
        .length,
      failedConnections: results.filter(r => r.status === 'error').length,
      testDuration: duration,
      results,
    };
  } catch (error) {
    spinner.fail('Stress test failed');
    throw error;
  }
}

async function verifyConnection(chain?: string): Promise<any> {
  const spinner = ora('Verifying WebSocket connection status...').start();

  try {
    // Check tx-monitor service health
    const healthResponse = await axios.get(
      `${process.env.TX_MONITOR_URL || 'http://localhost:3003'}/health`
    );

    const wsStatus = healthResponse.data.websocket;

    if (!wsStatus) {
      throw new Error('WebSocket service not available');
    }

    spinner.succeed('WebSocket connection verified');

    return {
      status: 'verified',
      serviceHealth: healthResponse.data,
      chain: chain || 'localhost',
    };
  } catch (error) {
    spinner.fail('Connection verification failed');
    throw error;
  }
}

async function monitorConnectionHealth(duration: number): Promise<any> {
  const spinner = ora(
    `Monitoring WebSocket health for ${duration}ms...`
  ).start();

  try {
    const healthChecks: any[] = [];
    const interval = Math.min(duration / 10, 1000); // Check 10 times or every 1s

    const startTime = Date.now();

    while (Date.now() - startTime < duration) {
      try {
        const healthResponse = await axios.get(
          `${process.env.TX_MONITOR_URL || 'http://localhost:3003'}/health`,
          {
            timeout: 2000,
          }
        );

        healthChecks.push({
          timestamp: Date.now(),
          status: 'healthy',
          data: healthResponse.data,
        });
      } catch (error: any) {
        healthChecks.push({
          timestamp: Date.now(),
          status: 'unhealthy',
          error: error.message,
        });
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    const healthyChecks = healthChecks.filter(
      c => c.status === 'healthy'
    ).length;
    const totalChecks = healthChecks.length;
    const healthPercentage = (healthyChecks / totalChecks) * 100;

    spinner.succeed(
      `Health monitoring completed: ${healthPercentage.toFixed(1)}% uptime`
    );

    return {
      duration,
      totalChecks,
      healthyChecks,
      unhealthyChecks: totalChecks - healthyChecks,
      uptimePercentage: healthPercentage,
      checks: healthChecks,
    };
  } catch (error) {
    spinner.fail('Health monitoring failed');
    throw error;
  }
}

function getWebSocketUrl(chain?: string): string {
  const baseUrl = process.env.TX_MONITOR_WS_URL || 'ws://localhost:3003';
  return chain ? `${baseUrl}?chain=${chain}` : baseUrl;
}

function displayWebSocketResult(result: any): void {
  console.log(chalk.cyan('\n📡 WebSocket Test Results:\n'));

  if (result.status === 'connected') {
    console.log(`  Status: ${chalk.green('Connected ✅')}`);
    console.log(`  URL: ${chalk.blue(result.url)}`);
    console.log(`  Chain: ${chalk.yellow(result.chain)}`);
  } else if (result.status === 'disconnected') {
    console.log(`  Status: ${chalk.red('Disconnected ❌')}`);
    console.log(`  Method: ${chalk.yellow(result.method)}`);
    console.log(`  URL: ${chalk.blue(result.url)}`);
  } else if (result.status === 'reconnected') {
    console.log(`  Status: ${chalk.green('Reconnected ✅')}`);
    console.log(`  Delay: ${chalk.yellow(result.reconnectionDelay + 'ms')}`);
  } else if (result.status === 'verified') {
    console.log(`  Status: ${chalk.green('Verified ✅')}`);
    console.log(`  Chain: ${chalk.yellow(result.chain)}`);
    console.log(
      `  Service Health: ${chalk.blue(JSON.stringify(result.serviceHealth, null, 2))}`
    );
  } else if (result.totalConnections) {
    console.log(`  Total Connections: ${chalk.blue(result.totalConnections)}`);
    console.log(`  Successful: ${chalk.green(result.successfulConnections)}`);
    console.log(`  Failed: ${chalk.red(result.failedConnections)}`);
    console.log(
      `  Success Rate: ${chalk.yellow(((result.successfulConnections / result.totalConnections) * 100).toFixed(1) + '%')}`
    );
  } else if (result.uptimePercentage !== undefined) {
    console.log(
      `  Uptime: ${chalk.green(result.uptimePercentage.toFixed(1) + '%')}`
    );
    console.log(`  Total Checks: ${chalk.blue(result.totalChecks)}`);
    console.log(`  Healthy: ${chalk.green(result.healthyChecks)}`);
    console.log(`  Unhealthy: ${chalk.red(result.unhealthyChecks)}`);
  }
}
