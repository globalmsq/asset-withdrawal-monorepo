import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { apiClient } from '../utils/api-client';
import {
  MetricsCollector,
  PerformanceTimer,
  formatMetricsSummary,
} from '../utils/metrics';

interface MultichainCommandOptions {
  chain?: string;
  network?: string;
  action: string;
  amount?: string;
  token?: string;
  to?: string;
  json: boolean;
  report: boolean;
}

interface ChainTestResult {
  chain: string;
  network: string;
  action: string;
  success: boolean;
  duration: number;
  details: any;
  timestamp: string;
  error?: string;
}

interface ChainConfig {
  name: string;
  chainId: number;
  network: string;
  rpcUrl: string;
  nativeCurrency: string;
  blockExplorer?: string;
}

export async function multichainCommand(
  options: MultichainCommandOptions
): Promise<void> {
  const metrics = new MetricsCollector();
  const results: ChainTestResult[] = [];

  console.log(chalk.blue(`\n⛓️  Multi-Chain Environment Test\n`));
  console.log(chalk.gray(`Action: ${options.action}`));
  if (options.chain) console.log(chalk.gray(`Chain: ${options.chain}`));
  if (options.network) console.log(chalk.gray(`Network: ${options.network}`));
  console.log();

  metrics.start();

  const actions = {
    'test-chain': async () => await testChain(options.chain!, options.network!),
    'test-all-chains': async () => await testAllChains(),
    'test-rpc': async () =>
      await testRpcEndpoint(options.chain!, options.network!),
    'test-withdrawal': async () => await testChainWithdrawal(options),
    'compare-chains': async () => await compareChainPerformance(),
    'validate-multicall': async () =>
      await validateMulticall3(options.chain!, options.network!),
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
      chain: options.chain || 'all',
      network: options.network || 'all',
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
      displayMultichainResult(result);
    }
  } catch (error: any) {
    const timer = new PerformanceTimer();
    const duration = timer.stop();

    metrics.recordRequest(duration, 'error', undefined, error.message);

    results.push({
      chain: options.chain || 'unknown',
      network: options.network || 'unknown',
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

async function getChainConfigs(): Promise<ChainConfig[]> {
  try {
    const configResponse = await axios.get(
      `${process.env.API_URL || 'http://localhost:3000'}/api/chains`
    );
    return configResponse.data.chains;
  } catch (error) {
    // Fallback to default chains if API not available
    return [
      {
        name: 'localhost',
        chainId: 31337,
        network: 'testnet',
        rpcUrl: 'http://localhost:8545',
        nativeCurrency: 'ETH',
      },
      {
        name: 'polygon',
        chainId: 80002,
        network: 'amoy',
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        nativeCurrency: 'MATIC',
      },
      {
        name: 'ethereum',
        chainId: 11155111,
        network: 'sepolia',
        rpcUrl: 'https://ethereum-sepolia.publicnode.com',
        nativeCurrency: 'ETH',
      },
      {
        name: 'bsc',
        chainId: 97,
        network: 'testnet',
        rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
        nativeCurrency: 'BNB',
      },
    ];
  }
}

async function testChain(chain: string, network: string): Promise<any> {
  const spinner = ora(`Testing ${chain} ${network} configuration...`).start();

  try {
    const configs = await getChainConfigs();
    const chainConfig = configs.find(
      c => c.name === chain && c.network === network
    );

    if (!chainConfig) {
      throw new Error(`Chain configuration not found: ${chain} ${network}`);
    }

    // Test RPC connectivity
    const rpcResponse = await axios.post(
      chainConfig.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      },
      { timeout: 5000 }
    );

    const actualChainId = parseInt(rpcResponse.data.result, 16);

    if (actualChainId !== chainConfig.chainId) {
      throw new Error(
        `Chain ID mismatch: expected ${chainConfig.chainId}, got ${actualChainId}`
      );
    }

    spinner.succeed(`${chain} ${network} configuration verified`);

    return {
      chain,
      network,
      chainId: actualChainId,
      rpcUrl: chainConfig.rpcUrl,
      nativeCurrency: chainConfig.nativeCurrency,
      rpcLatency: Date.now(), // Could measure actual latency
      status: 'verified',
    };
  } catch (error) {
    spinner.fail(`${chain} ${network} configuration test failed`);
    throw error;
  }
}

async function testAllChains(): Promise<any> {
  const spinner = ora('Testing all chain configurations...').start();

  try {
    const configs = await getChainConfigs();
    const results: any[] = [];

    for (const config of configs) {
      try {
        const result = await testChain(config.name, config.network);
        results.push({ ...result, status: 'passed' });
      } catch (error: any) {
        results.push({
          chain: config.name,
          network: config.network,
          status: 'failed',
          error: error.message,
        });
      }
    }

    const passedChains = results.filter(r => r.status === 'passed').length;
    const totalChains = results.length;

    spinner.succeed(
      `Chain testing completed: ${passedChains}/${totalChains} chains operational`
    );

    return {
      totalChains,
      passedChains,
      failedChains: totalChains - passedChains,
      results,
      summary: {
        operational: passedChains === totalChains,
        percentage: (passedChains / totalChains) * 100,
      },
    };
  } catch (error) {
    spinner.fail('Chain testing failed');
    throw error;
  }
}

async function testRpcEndpoint(chain: string, network: string): Promise<any> {
  const spinner = ora(
    `Testing RPC endpoint for ${chain} ${network}...`
  ).start();

  try {
    const configs = await getChainConfigs();
    const chainConfig = configs.find(
      c => c.name === chain && c.network === network
    );

    if (!chainConfig) {
      throw new Error(`Chain configuration not found: ${chain} ${network}`);
    }

    const startTime = Date.now();

    // Test basic connectivity
    const chainIdResponse = await axios.post(
      chainConfig.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      },
      { timeout: 5000 }
    );

    // Test block number
    const blockNumberResponse = await axios.post(
      chainConfig.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 2,
      },
      { timeout: 5000 }
    );

    // Test gas price
    const gasPriceResponse = await axios.post(
      chainConfig.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 3,
      },
      { timeout: 5000 }
    );

    const latency = Date.now() - startTime;

    spinner.succeed(`RPC endpoint test completed (${latency}ms)`);

    return {
      chain,
      network,
      rpcUrl: chainConfig.rpcUrl,
      latency,
      chainId: parseInt(chainIdResponse.data.result, 16),
      blockNumber: parseInt(blockNumberResponse.data.result, 16),
      gasPrice: parseInt(gasPriceResponse.data.result, 16),
      status: 'operational',
    };
  } catch (error) {
    spinner.fail(`RPC endpoint test failed`);
    throw error;
  }
}

async function testChainWithdrawal(
  options: MultichainCommandOptions
): Promise<any> {
  const spinner = ora(
    `Testing withdrawal on ${options.chain} ${options.network}...`
  ).start();

  try {
    const response = await apiClient.createWithdrawalRequest({
      amount: options.amount || '10',
      tokenAddress: options.token || process.env.DEFAULT_TOKEN!,
      recipientAddress: options.to || process.env.TEST_WALLET_ADDRESS!,
      chain: options.chain!,
      network: options.network!,
    });

    spinner.succeed(`Withdrawal request created: ${response.id}`);

    return {
      chain: options.chain,
      network: options.network,
      requestId: response.id,
      amount: options.amount || '10',
      status: 'submitted',
    };
  } catch (error) {
    spinner.fail('Chain withdrawal test failed');
    throw error;
  }
}

async function compareChainPerformance(): Promise<any> {
  const spinner = ora('Comparing chain performance...').start();

  try {
    const configs = await getChainConfigs();
    const results: any[] = [];

    for (const config of configs) {
      const startTime = Date.now();

      try {
        await testRpcEndpoint(config.name, config.network);
        const latency = Date.now() - startTime;

        results.push({
          chain: config.name,
          network: config.network,
          latency,
          status: 'operational',
        });
      } catch (error: any) {
        results.push({
          chain: config.name,
          network: config.network,
          latency: -1,
          status: 'failed',
          error: error.message,
        });
      }
    }

    // Sort by latency (operational chains first, then by latency)
    results.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'operational' ? -1 : 1;
      }
      return a.latency - b.latency;
    });

    spinner.succeed('Chain performance comparison completed');

    return {
      results,
      fastest: results.find(r => r.status === 'operational'),
      summary: {
        operational: results.filter(r => r.status === 'operational').length,
        failed: results.filter(r => r.status === 'failed').length,
        avgLatency:
          results
            .filter(r => r.status === 'operational')
            .reduce((sum, r) => sum + r.latency, 0) /
          results.filter(r => r.status === 'operational').length,
      },
    };
  } catch (error) {
    spinner.fail('Chain performance comparison failed');
    throw error;
  }
}

async function validateMulticall3(
  chain: string,
  network: string
): Promise<any> {
  const spinner = ora(
    `Validating Multicall3 contract on ${chain} ${network}...`
  ).start();

  try {
    // Get chain configuration
    const configs = await getChainConfigs();
    const chainConfig = configs.find(
      c => c.name === chain && c.network === network
    );

    if (!chainConfig) {
      throw new Error(`Chain configuration not found: ${chain} ${network}`);
    }

    // Test if Multicall3 contract is deployed and accessible
    const multicall3Address = getMulticall3Address(chain, network);

    if (!multicall3Address) {
      throw new Error(
        `Multicall3 address not configured for ${chain} ${network}`
      );
    }

    // Check if contract exists
    const codeResponse = await axios.post(
      chainConfig.rpcUrl,
      {
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [multicall3Address, 'latest'],
        id: 1,
      },
      { timeout: 5000 }
    );

    const contractCode = codeResponse.data.result;

    if (!contractCode || contractCode === '0x') {
      throw new Error(`Multicall3 contract not found at ${multicall3Address}`);
    }

    spinner.succeed(`Multicall3 contract validated: ${multicall3Address}`);

    return {
      chain,
      network,
      multicall3Address,
      contractCodeSize: contractCode.length,
      status: 'validated',
    };
  } catch (error) {
    spinner.fail(`Multicall3 validation failed`);
    throw error;
  }
}

function getMulticall3Address(chain: string, network: string): string | null {
  // Standard Multicall3 addresses across different chains
  const multicall3Addresses: Record<string, string> = {
    'localhost-testnet': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'polygon-amoy': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'ethereum-sepolia': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'bsc-testnet': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'polygon-mainnet': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'ethereum-mainnet': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'bsc-mainnet': '0xcA11bde05977b3631167028862bE2a173976CA11',
  };

  return multicall3Addresses[`${chain}-${network}`] || null;
}

function displayMultichainResult(result: any): void {
  console.log(chalk.cyan('\n⛓️  Multi-Chain Test Results:\n'));

  if (result.chain && result.network) {
    // Single chain result
    console.log(`  Chain: ${chalk.yellow(result.chain)} (${result.network})`);
    console.log(
      `  Status: ${result.status === 'verified' || result.status === 'operational' ? chalk.green('✅ Operational') : chalk.red('❌ Failed')}`
    );

    if (result.chainId) {
      console.log(`  Chain ID: ${chalk.blue(result.chainId)}`);
    }

    if (result.latency) {
      console.log(`  Latency: ${chalk.yellow(result.latency + 'ms')}`);
    }

    if (result.multicall3Address) {
      console.log(`  Multicall3: ${chalk.blue(result.multicall3Address)}`);
    }
  } else if (result.results) {
    // Multiple chain results
    console.log(
      `  Total Chains: ${chalk.blue(result.totalChains || result.results.length)}`
    );
    console.log(
      `  Operational: ${chalk.green(result.passedChains || result.summary?.operational || result.results.filter((r: any) => r.status === 'operational' || r.status === 'passed').length)}`
    );
    console.log(
      `  Failed: ${chalk.red(result.failedChains || result.summary?.failed || result.results.filter((r: any) => r.status === 'failed').length)}`
    );

    if (result.summary?.avgLatency) {
      console.log(
        `  Avg Latency: ${chalk.yellow(result.summary.avgLatency.toFixed(0) + 'ms')}`
      );
    }

    if (result.fastest) {
      console.log(
        `  Fastest: ${chalk.green(result.fastest.chain)} (${result.fastest.latency}ms)`
      );
    }

    console.log(chalk.cyan('\n  Chain Details:'));
    result.results.forEach((r: any) => {
      const status =
        r.status === 'operational' || r.status === 'passed'
          ? chalk.green('✅')
          : chalk.red('❌');
      const latency =
        r.latency > 0 ? chalk.gray(`${r.latency}ms`) : chalk.gray('N/A');

      console.log(`    ${status} ${r.chain}-${r.network} (${latency})`);

      if (r.error) {
        console.log(`      ${chalk.red('Error:')} ${r.error}`);
      }
    });
  }

  if (result.requestId) {
    console.log(`  Request ID: ${chalk.blue(result.requestId)}`);
    console.log(`  Amount: ${chalk.yellow(result.amount)}`);
  }
}
