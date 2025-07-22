import { PrismaClient, Prisma } from '@prisma/client';
import type { BatchTransaction as PrismaBatchTransaction } from '@prisma/client';
import { DatabaseService } from './database';

export interface BatchTransaction {
  id: string;
  txHash: string | null;
  multicallAddress: string;
  totalRequests: number;
  status: string;
  gasUsed: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class BatchTransactionService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    } else {
      const dbService = DatabaseService.getInstance();
      this.prisma = dbService.getClient();
    }
  }

  private convertToBatchTransaction(
    prismaBatch: PrismaBatchTransaction
  ): BatchTransaction {
    return {
      ...prismaBatch,
      totalRequests: Number(prismaBatch.totalRequests),
    };
  }

  async createBatchTransaction(data: {
    id: string;
    multicallAddress: string;
    totalRequests: number;
    status?: string;
  }): Promise<BatchTransaction> {
    const prismaBatch = await this.prisma.batchTransaction.create({
      data: {
        ...data,
        status: data.status || 'PENDING',
      },
    });
    return this.convertToBatchTransaction(prismaBatch);
  }

  async getBatchTransactionById(
    id: string
  ): Promise<BatchTransaction | null> {
    const prismaBatch = await this.prisma.batchTransaction.findUnique({
      where: { id },
    });
    return prismaBatch ? this.convertToBatchTransaction(prismaBatch) : null;
  }

  async updateBatchTransaction(
    id: string,
    data: Partial<{
      txHash: string;
      status: string;
      gasUsed: string;
      errorMessage: string;
    }>
  ): Promise<BatchTransaction> {
    const prismaBatch = await this.prisma.batchTransaction.update({
      where: { id },
      data,
    });
    return this.convertToBatchTransaction(prismaBatch);
  }

  async updateBatchStatus(
    id: string,
    status: string
  ): Promise<BatchTransaction> {
    const prismaBatch = await this.prisma.batchTransaction.update({
      where: { id },
      data: { status },
    });
    return this.convertToBatchTransaction(prismaBatch);
  }

  async updateBatchStatusWithError(
    id: string,
    status: string,
    errorMessage: string
  ): Promise<BatchTransaction> {
    const prismaBatch = await this.prisma.batchTransaction.update({
      where: { id },
      data: {
        status,
        errorMessage,
      },
    });
    return this.convertToBatchTransaction(prismaBatch);
  }

  async updateBatchWithTxHash(
    id: string,
    txHash: string,
    status: string = 'SIGNED'
  ): Promise<BatchTransaction> {
    const prismaBatch = await this.prisma.batchTransaction.update({
      where: { id },
      data: {
        txHash,
        status,
      },
    });
    return this.convertToBatchTransaction(prismaBatch);
  }

  async getPendingBatchTransactions(): Promise<BatchTransaction[]> {
    const prismaBatches = await this.prisma.batchTransaction.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    return prismaBatches.map((batch) => this.convertToBatchTransaction(batch));
  }
}
