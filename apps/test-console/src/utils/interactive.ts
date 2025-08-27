import inquirer from 'inquirer';
import chalk from 'chalk';
import { requestCommand } from '../commands/request';
import { errorCommand } from '../commands/error';
import { statusCommand } from '../commands/status';
import { batchCommand } from '../commands/batch';

export async function interactiveMode(): Promise<void> {
  let exit = false;

  while (!exit) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📤 Send withdrawal request', value: 'request' },
          { name: '🔥 Inject error scenario', value: 'error' },
          { name: '🔍 Check request status', value: 'status' },
          { name: '🎯 Run test scenario', value: 'batch' },
          { name: '❌ Exit', value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      exit = true;
      console.log(chalk.cyan('\nGoodbye! 👋\n'));
      continue;
    }

    try {
      switch (action) {
        case 'request':
          await handleRequestAction();
          break;
        case 'error':
          await handleErrorAction();
          break;
        case 'status':
          await handleStatusAction();
          break;
        case 'batch':
          await handleBatchAction();
          break;
      }
    } catch (error: any) {
      console.error(chalk.red(`\nError: ${error.message}\n`));
    }

    // Add spacing between actions
    console.log('\n');
  }
}

async function handleRequestAction(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: 'Amount to withdraw:',
      default: process.env.DEFAULT_AMOUNT || '50',
      validate: input => {
        const num = parseFloat(input);
        return (
          (!isNaN(num) && num > 0) || 'Please enter a valid positive number'
        );
      },
    },
    {
      type: 'input',
      name: 'token',
      message: 'Token address:',
      default: process.env.DEFAULT_TOKEN,
      validate: input => {
        return (
          /^0x[a-fA-F0-9]{40}$/.test(input) ||
          'Please enter a valid Ethereum address'
        );
      },
    },
    {
      type: 'input',
      name: 'to',
      message: 'Recipient address:',
      default: process.env.TEST_WALLET_ADDRESS,
      validate: input => {
        return (
          /^0x[a-fA-F0-9]{40}$/.test(input) ||
          'Please enter a valid Ethereum address'
        );
      },
    },
    {
      type: 'input',
      name: 'count',
      message: 'Number of requests:',
      default: '1',
      validate: input => {
        const num = parseInt(input, 10);
        return (
          (!isNaN(num) && num > 0 && num <= 100) ||
          'Please enter a number between 1 and 100'
        );
      },
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Send request(s)?',
      default: true,
    },
  ]);

  if (answers.confirm) {
    await requestCommand({
      ...answers,
      delay: process.env.REQUEST_DELAY_MS || '100',
      chain: process.env.DEFAULT_CHAIN || 'localhost',
      network: process.env.DEFAULT_NETWORK || 'testnet',
      json: false,
    });
  }
}

async function handleErrorAction(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'Select error type:',
      choices: [
        { name: 'Nonce Collision', value: 'nonce-collision' },
        { name: 'Gas Exhaustion', value: 'gas-exhaustion' },
        { name: 'Invalid Token', value: 'invalid-token' },
        { name: 'RPC Failure', value: 'rpc-failure' },
        { name: 'Malformed Message', value: 'malformed-message' },
        { name: 'Network Delay', value: 'network-delay' },
        { name: 'Database Lock', value: 'db-lock' },
      ],
    },
    {
      type: 'list',
      name: 'severity',
      message: 'Error severity:',
      choices: [
        { name: 'Low', value: 'low' },
        { name: 'Medium', value: 'medium' },
        { name: 'High', value: 'high' },
      ],
      default: 'medium',
    },
    {
      type: 'input',
      name: 'count',
      message: 'Number of errors to inject:',
      default: '1',
      validate: input => {
        const num = parseInt(input, 10);
        return (
          (!isNaN(num) && num > 0 && num <= 10) ||
          'Please enter a number between 1 and 10'
        );
      },
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Inject error(s)?',
      default: true,
    },
  ]);

  if (answers.confirm) {
    await errorCommand({
      ...answers,
      json: false,
    });
  }
}

async function handleStatusAction(): Promise<void> {
  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Status check mode:',
      choices: [
        { name: 'Check specific request', value: 'single' },
        { name: 'View all recent requests', value: 'all' },
        { name: 'Watch status (real-time)', value: 'watch' },
      ],
    },
  ]);

  let options: any = {
    json: false,
    all: false,
    watch: false,
    interval: '2000',
  };

  if (mode === 'single') {
    const { id } = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'Enter request ID:',
        validate: input => input.length > 0 || 'Please enter a request ID',
      },
    ]);
    options.id = id;
  } else if (mode === 'all') {
    options.all = true;
  } else if (mode === 'watch') {
    const watchAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'Request ID to watch (leave empty for all):',
      },
      {
        type: 'input',
        name: 'interval',
        message: 'Refresh interval (ms):',
        default: '2000',
        validate: input => {
          const num = parseInt(input, 10);
          return (!isNaN(num) && num >= 500) || 'Minimum interval is 500ms';
        },
      },
    ]);

    options.watch = true;
    if (watchAnswers.id) {
      options.id = watchAnswers.id;
    }
    options.interval = watchAnswers.interval;

    console.log(chalk.gray('\nPress Ctrl+C to stop watching\n'));
  }

  await statusCommand(options);
}

async function handleBatchAction(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'scenario',
      message: 'Select test scenario:',
      choices: [
        {
          name: 'Normal Flow - Standard withdrawal requests',
          value: 'normal-flow',
        },
        { name: 'Stress Test - High concurrency', value: 'stress-test' },
        {
          name: 'Error Recovery - Test error handling',
          value: 'error-recovery',
        },
        { name: 'Mixed - Combination of scenarios', value: 'mixed' },
      ],
    },
    {
      type: 'input',
      name: 'requests',
      message: 'Number of requests:',
      default: '10',
      validate: input => {
        const num = parseInt(input, 10);
        return (
          (!isNaN(num) && num > 0 && num <= 1000) ||
          'Please enter a number between 1 and 1000'
        );
      },
    },
    {
      type: 'confirm',
      name: 'report',
      message: 'Generate detailed report?',
      default: true,
    },
    {
      type: 'checkbox',
      name: 'formats',
      message: 'Report formats:',
      choices: [
        { name: 'JSON', value: 'json', checked: true },
        { name: 'CSV', value: 'csv', checked: false },
      ],
      when: answers => answers.report,
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Run scenario?',
      default: true,
    },
  ]);

  if (answers.confirm) {
    await batchCommand({
      scenario: answers.scenario,
      requests: answers.requests,
      report: answers.report,
      json: answers.formats?.includes('json') || false,
      csv: answers.formats?.includes('csv') || false,
    });
  }
}
