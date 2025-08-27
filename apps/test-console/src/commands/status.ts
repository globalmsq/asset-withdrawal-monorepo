import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { apiClient } from '../utils/api-client';

interface StatusCommandOptions {
  id?: string;
  all: boolean;
  watch: boolean;
  interval: string;
  json: boolean;
}

export async function statusCommand(
  options: StatusCommandOptions
): Promise<void> {
  if (options.watch) {
    await watchStatus(options);
  } else if (options.id) {
    await checkSingleStatus(options.id, options.json);
  } else if (options.all) {
    await checkAllStatuses(options.json);
  } else {
    console.log(chalk.yellow('Please specify --id, --all, or --watch'));
    process.exit(1);
  }
}

async function checkSingleStatus(
  requestId: string,
  json: boolean
): Promise<void> {
  const spinner = ora(`Checking status for ${requestId}...`).start();

  try {
    const status = await apiClient.getRequestStatus(requestId);
    spinner.succeed('Status retrieved');

    if (json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      displaySingleStatus(requestId, status);
    }
  } catch (error: any) {
    spinner.fail(`Failed to get status: ${error.message}`);
    process.exit(1);
  }
}

async function checkAllStatuses(json: boolean): Promise<void> {
  const spinner = ora('Fetching recent requests...').start();

  try {
    const requests = await apiClient.getRecentRequests(20);
    spinner.succeed(`Found ${requests.length} recent requests`);

    if (json) {
      console.log(JSON.stringify(requests, null, 2));
    } else {
      displayAllStatuses(requests);
    }
  } catch (error: any) {
    spinner.fail(`Failed to get requests: ${error.message}`);
    process.exit(1);
  }
}

async function watchStatus(options: StatusCommandOptions): Promise<void> {
  const interval = parseInt(options.interval, 10);
  console.log(chalk.cyan(`👀 Watching status (refresh every ${interval}ms)\n`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  const watch = async () => {
    // Clear console for fresh display
    console.clear();
    console.log(
      chalk.cyan(`👀 Status Monitor - ${new Date().toLocaleTimeString()}\n`)
    );

    try {
      if (options.id) {
        const status = await apiClient.getRequestStatus(options.id);
        displaySingleStatus(options.id, status);
      } else {
        const requests = await apiClient.getRecentRequests(10);
        displayAllStatuses(requests);
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  };

  // Initial display
  await watch();

  // Set up interval
  setInterval(watch, interval);
}

function displaySingleStatus(requestId: string, status: any): void {
  console.log(chalk.blue('\n📄 Request Status\n'));

  const statusColor = getStatusColor(status.status);

  console.log(`  ${chalk.gray('Request ID:')} ${requestId}`);
  console.log(
    `  ${chalk.gray('Status:')} ${statusColor(status.status.toUpperCase())}`
  );
  console.log(`  ${chalk.gray('Amount:')} ${status.amount}`);
  console.log(`  ${chalk.gray('Token:')} ${status.tokenAddress}`);
  console.log(`  ${chalk.gray('Recipient:')} ${status.recipientAddress}`);

  if (status.txHash) {
    console.log(`  ${chalk.gray('Tx Hash:')} ${status.txHash}`);
  }

  if (status.error) {
    console.log(`  ${chalk.gray('Error:')} ${chalk.red(status.error)}`);
  }

  console.log(
    `  ${chalk.gray('Created:')} ${new Date(status.createdAt).toLocaleString()}`
  );

  if (status.completedAt) {
    console.log(
      `  ${chalk.gray('Completed:')} ${new Date(status.completedAt).toLocaleString()}`
    );
    const duration =
      new Date(status.completedAt).getTime() -
      new Date(status.createdAt).getTime();
    console.log(
      `  ${chalk.gray('Duration:')} ${(duration / 1000).toFixed(2)}s`
    );
  }
}

function displayAllStatuses(requests: any[]): void {
  console.log(chalk.blue('\n📊 Recent Requests\n'));

  if (requests.length === 0) {
    console.log(chalk.gray('No recent requests found'));
    return;
  }

  const table = new Table({
    head: ['ID', 'Status', 'Amount', 'Token', 'Created', 'Duration'],
    style: {
      head: ['cyan'],
    },
    colWidths: [20, 15, 10, 20, 20, 10],
  });

  requests.forEach(request => {
    const statusColor = getStatusColor(request.status);
    const duration = request.completedAt
      ? `${((new Date(request.completedAt).getTime() - new Date(request.createdAt).getTime()) / 1000).toFixed(1)}s`
      : '-';

    table.push([
      request.id.substring(0, 18) + '...',
      statusColor(request.status.toUpperCase()),
      request.amount,
      request.tokenAddress.substring(0, 10) + '...',
      new Date(request.createdAt).toLocaleTimeString(),
      duration,
    ]);
  });

  console.log(table.toString());

  // Summary statistics
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    processing: requests.filter(r => r.status === 'processing').length,
    completed: requests.filter(r => r.status === 'completed').length,
    failed: requests.filter(r => r.status === 'failed').length,
  };

  console.log(chalk.blue('\n📈 Summary:'));
  console.log(
    `  Total: ${stats.total} | ` +
      `Pending: ${chalk.yellow(stats.pending)} | ` +
      `Processing: ${chalk.blue(stats.processing)} | ` +
      `Completed: ${chalk.green(stats.completed)} | ` +
      `Failed: ${chalk.red(stats.failed)}`
  );
}

function getStatusColor(status: string): (text: string) => string {
  switch (status.toLowerCase()) {
    case 'pending':
      return chalk.yellow;
    case 'processing':
    case 'signing':
    case 'broadcasting':
      return chalk.blue;
    case 'completed':
    case 'success':
      return chalk.green;
    case 'failed':
    case 'error':
      return chalk.red;
    default:
      return chalk.gray;
  }
}
