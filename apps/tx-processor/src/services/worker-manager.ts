import { QueueFactory } from '@asset-withdrawal/shared';
import { Logger } from '../utils/logger';
import { BaseWorker, WorkerStatus } from '../workers/base-worker';
import { ValidationSigningWorker } from '../workers/validation-signing-worker';
import { TransactionSenderWorker } from '../workers/transaction-sender-worker';
import { WithdrawalRequest, SignedTransaction } from '../types';
import { config } from '../config';

export class WorkerManager {
  private static instance: WorkerManager;
  private workers: Map<string, BaseWorker<any, any>> = new Map();
  private logger = new Logger('WorkerManager');

  private constructor() {}

  static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing workers...');

    // Create queues
    const txRequestQueue = QueueFactory.createFromEnv<WithdrawalRequest>('tx-request-queue');
    const signedTxQueue = QueueFactory.createFromEnv<SignedTransaction>('signed-tx-queue');

    // Initialize Validation & Signing Worker
    if (config.workers.validationSigning.enabled) {
      const validationSigningWorker = new ValidationSigningWorker(
        {
          name: 'ValidationSigningWorker',
          ...config.workers.validationSigning,
        },
        txRequestQueue,
        signedTxQueue
      );
      this.workers.set('validation-signing', validationSigningWorker);
    }

    // Initialize Transaction Sender Worker
    if (config.workers.transactionSender.enabled) {
      const transactionSenderWorker = new TransactionSenderWorker(
        {
          name: 'TransactionSenderWorker',
          ...config.workers.transactionSender,
        },
        signedTxQueue
      );
      this.workers.set('transaction-sender', transactionSenderWorker);
    }

    // Start all workers
    await this.startAll();
  }

  async startAll(): Promise<void> {
    this.logger.info('Starting all workers...');
    const promises = Array.from(this.workers.values()).map(worker => worker.start());
    await Promise.all(promises);
    this.logger.info('All workers started');
  }

  async stopAll(): Promise<void> {
    this.logger.info('Stopping all workers...');
    const promises = Array.from(this.workers.values()).map(worker => worker.stop());
    await Promise.all(promises);
    this.logger.info('All workers stopped');
  }

  async startWorker(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker ${name} not found`);
    }
    await worker.start();
  }

  async stopWorker(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker ${name} not found`);
    }
    await worker.stop();
  }

  getStatus(): { workers: WorkerStatus[] } {
    const workers = Array.from(this.workers.values()).map(worker => worker.getStatus());
    return { workers };
  }

  async shutdown(): Promise<void> {
    await this.stopAll();
  }
}
