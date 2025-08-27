import chalk from 'chalk';
import ora from 'ora';
import { apiClient } from '../utils/api-client';
import Table from 'cli-table3';

interface RequestCommandOptions {
  amount: string;
  token: string;
  to: string;
  count: string;
  delay: string;
  chain: string;
  network: string;
  json: boolean;
}

export async function requestCommand(
  options: RequestCommandOptions
): Promise<void> {
  const count = parseInt(options.count, 10);
  const delay = parseInt(options.delay, 10);
  const results: any[] = [];

  console.log(chalk.blue('\n📤 Sending withdrawal request(s)\n'));

  // Check API health first
  const healthSpinner = ora('Checking API health...').start();
  const isHealthy = await apiClient.health();

  if (!isHealthy) {
    healthSpinner.fail('API is not available');
    process.exit(1);
  }
  healthSpinner.succeed('API is healthy');

  // Send requests
  for (let i = 0; i < count; i++) {
    const spinner = ora(`Sending request ${i + 1}/${count}...`).start();

    try {
      const result = await apiClient.createWithdrawalRequest({
        amount: options.amount,
        tokenAddress: options.token,
        recipientAddress: options.to,
        chain: options.chain,
        network: options.network,
      });

      spinner.succeed(`Request ${i + 1} sent: ${result.id}`);

      results.push({
        index: i + 1,
        requestId: result.id,
        status: 'sent',
        timestamp: new Date().toISOString(),
      });

      // Delay between requests
      if (i < count - 1 && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error: any) {
      spinner.fail(`Request ${i + 1} failed: ${error.message}`);

      results.push({
        index: i + 1,
        requestId: null,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Display results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    displayResultsTable(results);
    displaySummary(results);
  }
}

function displayResultsTable(results: any[]): void {
  console.log(chalk.blue('\n📊 Results:\n'));

  const table = new Table({
    head: ['#', 'Request ID', 'Status', 'Time'],
    style: {
      head: ['cyan'],
    },
  });

  results.forEach(result => {
    table.push([
      result.index,
      result.requestId || '-',
      result.status === 'sent'
        ? chalk.green(result.status)
        : chalk.red(result.status),
      new Date(result.timestamp).toLocaleTimeString(),
    ]);
  });

  console.log(table.toString());
}

function displaySummary(results: any[]): void {
  const successful = results.filter(r => r.status === 'sent').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(chalk.blue('\n📈 Summary:\n'));
  console.log(chalk.green(`  ✅ Successful: ${successful}`));
  console.log(chalk.red(`  ❌ Failed: ${failed}`));
  console.log(chalk.gray(`  📝 Total: ${results.length}`));
  console.log(
    chalk.yellow(
      `  ⚡ Success rate: ${((successful / results.length) * 100).toFixed(1)}%`
    )
  );
}
