import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import yaml from 'js-yaml';

export interface TestScenario {
  name: string;
  description: string;
  steps: TestStep[];
  config?: {
    timeout?: number;
    retryCount?: number;
    parallel?: boolean;
  };
}

export interface TestStep {
  type:
    | 'request'
    | 'error'
    | 'wait'
    | 'validation'
    | 'websocket'
    | 'multichain';
  description: string;
  params: Record<string, any>;
  expectedResult?: 'success' | 'error' | 'timeout';
}

export interface ScenarioResult {
  scenarioName: string;
  steps: StepResult[];
  summary: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    duration: number;
    success: boolean;
  };
}

export interface StepResult {
  stepIndex: number;
  stepType: string;
  description: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  result?: any;
  error?: string;
}

export class ScenarioManager {
  private scenariosPath: string;

  constructor(scenariosPath?: string) {
    this.scenariosPath = scenariosPath || join(process.cwd(), 'test-scenarios');
  }

  async loadScenario(filename: string): Promise<TestScenario> {
    const fullPath = join(this.scenariosPath, filename);
    const content = await readFile(fullPath, 'utf-8');

    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
      return yaml.load(content) as TestScenario;
    } else if (filename.endsWith('.json')) {
      return JSON.parse(content);
    } else {
      throw new Error(`Unsupported file format: ${filename}`);
    }
  }

  async saveScenario(scenario: TestScenario, filename: string): Promise<void> {
    const fullPath = join(this.scenariosPath, filename);
    let content: string;

    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
      content = yaml.dump(scenario);
    } else if (filename.endsWith('.json')) {
      content = JSON.stringify(scenario, null, 2);
    } else {
      throw new Error(`Unsupported file format: ${filename}`);
    }

    await writeFile(fullPath, content);
  }

  generateStandardScenarios(): TestScenario[] {
    return [
      {
        name: 'normal-flow',
        description: 'Normal withdrawal flow test',
        steps: [
          {
            type: 'request',
            description: 'Submit normal withdrawal request',
            params: {
              amount: '50',
              tokenAddress: process.env.DEFAULT_TOKEN,
              recipientAddress: process.env.TEST_WALLET_ADDRESS,
              chain: 'localhost',
              network: 'testnet',
            },
            expectedResult: 'success',
          },
          {
            type: 'wait',
            description: 'Wait for processing',
            params: { duration: 2000 },
          },
          {
            type: 'validation',
            description: 'Verify request status',
            params: { expectedStatus: 'pending' },
          },
        ],
      },
      {
        name: 'stress-test',
        description: 'High-load stress testing',
        config: { parallel: true, timeout: 30000 },
        steps: [
          {
            type: 'request',
            description: 'Send multiple concurrent requests',
            params: {
              count: 50,
              amount: '10',
              tokenAddress: process.env.DEFAULT_TOKEN,
              recipientAddress: process.env.TEST_WALLET_ADDRESS,
              chain: 'localhost',
              network: 'testnet',
            },
            expectedResult: 'success',
          },
        ],
      },
      {
        name: 'error-recovery',
        description: 'Error injection and recovery testing',
        steps: [
          {
            type: 'error',
            description: 'Inject nonce collision',
            params: { type: 'nonce-collision', count: 3 },
          },
          {
            type: 'wait',
            description: 'Wait for DLQ processing',
            params: { duration: 5000 },
          },
          {
            type: 'validation',
            description: 'Verify error handling',
            params: { checkDlq: true },
          },
        ],
      },
      {
        name: 'multichain-test',
        description: 'Multi-chain environment testing',
        steps: [
          {
            type: 'multichain',
            description: 'Test Polygon network',
            params: { chain: 'polygon', network: 'amoy' },
          },
          {
            type: 'multichain',
            description: 'Test Ethereum network',
            params: { chain: 'ethereum', network: 'sepolia' },
          },
          {
            type: 'multichain',
            description: 'Test BSC network',
            params: { chain: 'bsc', network: 'testnet' },
          },
        ],
      },
      {
        name: 'websocket-resilience',
        description: 'WebSocket connection resilience testing',
        steps: [
          {
            type: 'websocket',
            description: 'Test connection failure',
            params: { action: 'disconnect' },
          },
          {
            type: 'wait',
            description: 'Wait for reconnection',
            params: { duration: 5000 },
          },
          {
            type: 'websocket',
            description: 'Verify reconnection',
            params: { action: 'verify-connection' },
            expectedResult: 'success',
          },
        ],
      },
    ];
  }

  async runScenario(
    scenario: TestScenario,
    executor: ScenarioExecutor
  ): Promise<ScenarioResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepStartTime = Date.now();
      let stepResult: StepResult;

      try {
        const result = await executor.executeStep(step);
        const duration = Date.now() - stepStartTime;

        stepResult = {
          stepIndex: i,
          stepType: step.type,
          description: step.description,
          status: result.success ? 'passed' : 'failed',
          duration,
          result: result.data,
          error: result.error,
        };
      } catch (error: any) {
        const duration = Date.now() - stepStartTime;
        stepResult = {
          stepIndex: i,
          stepType: step.type,
          description: step.description,
          status: 'failed',
          duration,
          error: error.message,
        };
      }

      results.push(stepResult);

      // Stop on failure unless configured to continue
      if (stepResult.status === 'failed' && !scenario.config?.retryCount) {
        break;
      }
    }

    const duration = Date.now() - startTime;
    const passedSteps = results.filter(r => r.status === 'passed').length;
    const failedSteps = results.filter(r => r.status === 'failed').length;

    return {
      scenarioName: scenario.name,
      steps: results,
      summary: {
        totalSteps: scenario.steps.length,
        passedSteps,
        failedSteps,
        duration,
        success: passedSteps === scenario.steps.length,
      },
    };
  }
}

export interface ScenarioExecutor {
  executeStep(
    step: TestStep
  ): Promise<{ success: boolean; data?: any; error?: string }>;
}

export function formatScenarioResult(result: ScenarioResult): string {
  const { scenarioName, steps, summary } = result;
  const status = summary.success ? '✅ PASSED' : '❌ FAILED';

  let output = `
🧪 Scenario: ${scenarioName} ${status}
═══════════════════════════════════════════════════════

📊 Summary:
- Total Steps: ${summary.totalSteps}
- Passed: ${summary.passedSteps}
- Failed: ${summary.failedSteps}
- Duration: ${summary.duration}ms

📋 Step Details:
`;

  steps.forEach(step => {
    const statusIcon =
      step.status === 'passed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
    output += `\n${statusIcon} Step ${step.stepIndex + 1}: ${step.description}`;
    output += `\n   Type: ${step.stepType} | Duration: ${step.duration}ms`;

    if (step.error) {
      output += `\n   Error: ${step.error}`;
    }

    if (step.result && typeof step.result === 'object') {
      output += `\n   Result: ${JSON.stringify(step.result, null, 2)}`;
    }
  });

  return output;
}
