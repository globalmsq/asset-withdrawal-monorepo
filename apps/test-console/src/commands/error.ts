import chalk from 'chalk';
import ora from 'ora';
import { apiClient } from '../utils/api-client';
import axios from 'axios';

interface ErrorCommandOptions {
  type: string;
  severity: string;
  count: string;
  json: boolean;
}

interface ErrorScenario {
  name: string;
  description: string;
  execute: () => Promise<void>;
}

export async function errorCommand(
  options: ErrorCommandOptions
): Promise<void> {
  const count = parseInt(options.count, 10);
  const results: any[] = [];

  console.log(chalk.red(`\n🔥 Injecting ${options.type} error scenario\n`));

  const scenarios: Record<string, ErrorScenario> = {
    'nonce-collision': {
      name: 'Nonce Collision',
      description: 'Simulate multiple transactions with same nonce',
      execute: async () => {
        // Send multiple requests rapidly to cause nonce collision
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            apiClient.createWithdrawalRequest({
              amount: '10',
              tokenAddress: process.env.DEFAULT_TOKEN!,
              recipientAddress: process.env.TEST_WALLET_ADDRESS!,
              chain: 'localhost',
              network: 'testnet',
            })
          );
        }
        await Promise.allSettled(promises);
      },
    },
    'gas-exhaustion': {
      name: 'Gas Exhaustion',
      description: 'Request withdrawal with extremely high amount',
      execute: async () => {
        await apiClient.createWithdrawalRequest({
          amount: '999999999999',
          tokenAddress: process.env.DEFAULT_TOKEN!,
          recipientAddress: process.env.TEST_WALLET_ADDRESS!,
          chain: 'localhost',
          network: 'testnet',
        });
      },
    },
    'invalid-token': {
      name: 'Invalid Token',
      description: 'Request with non-existent token address',
      execute: async () => {
        await apiClient.createWithdrawalRequest({
          amount: '50',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          recipientAddress: process.env.TEST_WALLET_ADDRESS!,
          chain: 'localhost',
          network: 'testnet',
        });
      },
    },
    'rpc-failure': {
      name: 'RPC Failure',
      description: 'Simulate RPC connection failure',
      execute: async () => {
        // Temporarily break the RPC connection
        const badClient = axios.create({
          baseURL: 'http://localhost:9999', // Wrong port
          timeout: 1000,
        });
        await badClient.post('/api/withdrawal/request', {});
      },
    },
    'malformed-message': {
      name: 'Malformed Message',
      description: 'Send malformed request data',
      execute: async () => {
        const badClient = axios.create({
          baseURL: process.env.API_URL,
        });
        await badClient.post('/api/withdrawal/request', {
          amount: 'not-a-number',
          tokenAddress: 'invalid-address',
          toAddress: 123, // Should be string - API expects 'toAddress'
          chain: 'invalid',
          network: 'invalid',
        });
      },
    },
    'network-delay': {
      name: 'Network Delay',
      description: 'Simulate slow network conditions',
      execute: async () => {
        const slowClient = axios.create({
          baseURL: process.env.API_URL,
          timeout: 100, // Very short timeout
        });
        // Add artificial delay
        await new Promise(resolve => setTimeout(resolve, 5000));
        await slowClient.post('/api/withdrawal/request', {});
      },
    },
    'db-lock': {
      name: 'Database Lock',
      description: 'Simulate database lock with concurrent writes',
      execute: async () => {
        const promises = [];
        for (let i = 0; i < 20; i++) {
          promises.push(
            apiClient.createWithdrawalRequest({
              amount: '1',
              tokenAddress: process.env.DEFAULT_TOKEN!,
              recipientAddress: process.env.TEST_WALLET_ADDRESS!,
              chain: 'localhost',
              network: 'testnet',
            })
          );
        }
        await Promise.all(promises);
      },
    },
  };

  const scenario = scenarios[options.type];
  if (!scenario) {
    console.error(chalk.red(`Unknown error type: ${options.type}`));
    console.log('Available types:', Object.keys(scenarios).join(', '));
    process.exit(1);
  }

  console.log(chalk.yellow(`Scenario: ${scenario.name}`));
  console.log(chalk.gray(`Description: ${scenario.description}`));
  console.log(chalk.gray(`Severity: ${options.severity}\n`));

  for (let i = 0; i < count; i++) {
    const spinner = ora(`Injecting error ${i + 1}/${count}...`).start();

    try {
      await scenario.execute();
      spinner.succeed(`Error ${i + 1} injected successfully`);

      results.push({
        index: i + 1,
        type: options.type,
        severity: options.severity,
        status: 'injected',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // For error injection, catching errors might be expected
      spinner.warn(`Error ${i + 1} injection completed (${error.message})`);

      results.push({
        index: i + 1,
        type: options.type,
        severity: options.severity,
        status: 'completed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    // Small delay between injections
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Display results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    displayErrorResults(results);
  }
}

function displayErrorResults(results: any[]): void {
  console.log(chalk.red('\n💥 Error Injection Results:\n'));

  results.forEach(result => {
    const status =
      result.status === 'injected'
        ? chalk.green('Injected')
        : chalk.yellow('Completed');

    console.log(
      `  ${chalk.gray(`[${result.index}]`)} ` +
        `${status} - ` +
        `${chalk.cyan(result.type)} ` +
        `(${result.severity}) ` +
        `@ ${new Date(result.timestamp).toLocaleTimeString()}`
    );

    if (result.error) {
      console.log(`      ${chalk.gray(`Error: ${result.error}`)}`);
    }
  });

  console.log(chalk.gray(`\n  Total errors injected: ${results.length}`));
}
