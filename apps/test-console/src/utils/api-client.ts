import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import type {
  WithdrawalRequest,
  WithdrawalResponse,
  TransactionStatus,
} from 'shared';

export interface RequestOptions {
  amount: string;
  tokenAddress: string;
  recipientAddress: string;
  chain: string;
  network: string;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(
    baseURL: string = process.env.API_URL || 'http://localhost:8080'
  ) {
    this.client = axios.create({
      baseURL,
      timeout: Number(process.env.TIMEOUT_MS) || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      config => {
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(
            chalk.gray(`[API] ${config.method?.toUpperCase()} ${config.url}`)
          );
        }
        return config;
      },
      error => {
        console.error(chalk.red('[API] Request error:'), error.message);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      response => {
        if (process.env.LOG_LEVEL === 'debug') {
          console.log(chalk.gray(`[API] Response: ${response.status}`));
        }
        return response;
      },
      error => {
        if (error.response) {
          console.error(
            chalk.red(`[API] Error ${error.response.status}:`),
            error.response.data
          );
        } else if (error.request) {
          console.error(chalk.red('[API] No response from server'));
        } else {
          console.error(chalk.red('[API] Error:'), error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  async createWithdrawalRequest(
    options: RequestOptions
  ): Promise<{ id: string }> {
    const response = await this.client.post('/api/withdrawal/request', {
      amount: options.amount,
      tokenAddress: options.tokenAddress,
      toAddress: options.recipientAddress, // API expects 'toAddress'
      chain: options.chain, // API expects 'chain' not 'blockchain'
      network: options.network,
    });
    return response.data.data; // API returns nested data structure
  }

  async getRequestStatus(requestId: string): Promise<WithdrawalResponse> {
    const response = await this.client.get(
      `/api/withdrawal/status/${requestId}`
    );
    return response.data;
  }

  async getRecentRequests(limit: number = 10): Promise<WithdrawalRequest[]> {
    const response = await this.client.get('/api/withdrawal/requests', {
      params: { limit },
    });
    return response.data;
  }

  async health(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const apiClient = new ApiClient();
