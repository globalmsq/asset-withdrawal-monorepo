#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import { requestCommand } from './commands/request';
import { errorCommand } from './commands/error';
import { statusCommand } from './commands/status';
import { batchCommand } from './commands/batch';
import { websocketCommand } from './commands/websocket';
import { multichainCommand } from './commands/multichain';
import { secretsCommand } from './commands/secrets';
import { performanceCommand } from './commands/performance';
import { interactiveMode } from './utils/interactive';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

const program = new Command();

program
  .name('test-console')
  .description('CLI test tool for Asset Withdrawal System')
  .version('1.0.0');

// Request command
program
  .command('request')
  .description('Send withdrawal request(s)')
  .option(
    '-a, --amount <amount>',
    'Amount to withdraw',
    process.env.DEFAULT_AMOUNT || '50'
  )
  .option('-t, --token <address>', 'Token address', process.env.DEFAULT_TOKEN)
  .option(
    '-to, --to <address>',
    'Recipient address',
    process.env.TEST_WALLET_ADDRESS
  )
  .option('-c, --count <number>', 'Number of requests to send', '1')
  .option(
    '-d, --delay <ms>',
    'Delay between requests (ms)',
    process.env.REQUEST_DELAY_MS || '100'
  )
  .option(
    '--chain <chain>',
    'Blockchain name',
    process.env.DEFAULT_CHAIN || 'localhost'
  )
  .option(
    '--network <network>',
    'Network type',
    process.env.DEFAULT_NETWORK || 'testnet'
  )
  .option('--json', 'Output as JSON')
  .action(requestCommand);

// Error command
program
  .command('error')
  .description('Inject error scenario')
  .requiredOption(
    '-t, --type <type>',
    'Error type: nonce-collision, gas-exhaustion, invalid-token, rpc-failure, malformed-message, network-delay, db-lock'
  )
  .option('--severity <level>', 'Error severity: low, medium, high', 'medium')
  .option('--count <number>', 'Number of errors to inject', '1')
  .option('--json', 'Output as JSON')
  .action(errorCommand);

// Status command
program
  .command('status')
  .description('Check request status')
  .option('-i, --id <requestId>', 'Specific request ID to check')
  .option('--all', 'Check all recent requests')
  .option('-w, --watch', 'Watch status in real-time')
  .option('--interval <ms>', 'Watch interval (ms)', '2000')
  .option('--json', 'Output as JSON')
  .action(statusCommand);

// Batch command
program
  .command('batch')
  .description('Run test scenario')
  .requiredOption(
    '-s, --scenario <type>',
    'Scenario: normal-flow, stress-test, error-recovery, mixed'
  )
  .option('-r, --requests <number>', 'Number of requests', '10')
  .option('--duration <seconds>', 'Test duration in seconds')
  .option('--report', 'Generate detailed report')
  .option('--json', 'Output as JSON')
  .option('--csv', 'Output as CSV')
  .action(batchCommand);

// WebSocket command
program
  .command('websocket')
  .description('WebSocket connection testing')
  .requiredOption(
    '-a, --action <action>',
    'Action: test-connection, disconnect, reconnect, stress-test, verify-connection, monitor-health'
  )
  .option('--chain <chain>', 'Blockchain name', 'localhost')
  .option('--duration <ms>', 'Test duration in milliseconds', '10000')
  .option('--count <number>', 'Number of connections for stress test', '10')
  .option('--json', 'Output as JSON')
  .option('--report', 'Generate performance report')
  .action(websocketCommand);

// Multichain command
program
  .command('multichain')
  .description('Multi-chain environment testing')
  .requiredOption(
    '-a, --action <action>',
    'Action: test-chain, test-all-chains, test-rpc, test-withdrawal, compare-chains, validate-multicall'
  )
  .option('--chain <chain>', 'Blockchain name')
  .option('--network <network>', 'Network type')
  .option('--amount <amount>', 'Withdrawal amount', '10')
  .option('--token <address>', 'Token address', process.env.DEFAULT_TOKEN)
  .option(
    '--to <address>',
    'Recipient address',
    process.env.TEST_WALLET_ADDRESS
  )
  .option('--json', 'Output as JSON')
  .option('--report', 'Generate performance report')
  .action(multichainCommand);

// Secrets command
program
  .command('secrets')
  .description('AWS Secrets Manager failure testing')
  .requiredOption(
    '-s, --scenario <scenario>',
    'Scenario: access-failure, key-rotation, dlq-failover, timeout-simulation, permission-denied, service-unavailable, batch-failure'
  )
  .option('--duration <ms>', 'Timeout duration for timeout-simulation', '5000')
  .option('--count <number>', 'Request count for batch-failure', '5')
  .option('--severity <level>', 'Error severity: low, medium, high', 'medium')
  .option('--json', 'Output as JSON')
  .option('--report', 'Generate performance report')
  .action(secretsCommand);

// Performance command
program
  .command('performance')
  .description('Performance benchmarking and load testing')
  .requiredOption(
    '-t, --type <type>',
    'Test type: throughput, latency, load, stress, endurance, baseline'
  )
  .option('--requests <number>', 'Number of requests', '100')
  .option('--concurrency <number>', 'Concurrent requests', '10')
  .option('--duration <seconds>', 'Test duration in seconds', '30')
  .option('--output <filename>', 'Save results to file')
  .option('--json', 'Output as JSON')
  .option('--csv', 'Save as CSV format')
  .option('--report', 'Generate performance report')
  .action(performanceCommand);

// Interactive mode (default when no command specified)
program
  .command('interactive', { isDefault: true })
  .description('Start interactive mode')
  .action(async () => {
    console.log(chalk.cyan.bold('\n🚀 Asset Withdrawal Test Console\n'));
    await interactiveMode();
  });

// Parse arguments
program.parse(process.argv);
