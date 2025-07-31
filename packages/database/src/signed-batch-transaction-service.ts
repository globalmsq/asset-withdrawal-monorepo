import { PrismaClient, Prisma } from '@prisma/client';
import type { SignedBatchTransaction as PrismaSignedBatchTransaction } from '@prisma/client';
import { DatabaseService } from './database';

export interface SignedBatchTransaction {
  id: string;
  txHash: string | null;
  multicallAddress: string;
  totalRequests: number;
  totalAmount: string;
  symbol: string;
  chainId: number;
  nonce: number;
  gasLimit: string;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  tryCount: number;
  status: string;
  gasUsed: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  broadcastedAt: Date | null;
  confirmedAt: Date | null;
}

export class SignedBatchTransactionService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    } else {
      const dbService = DatabaseService.getInstance();
      this.prisma = dbService.getClient();
    }
  }

  private convertToSignedBatchTransaction(
    prismaBatch: PrismaSignedBatchTransaction
  ): SignedBatchTransaction {
    return {
      ...prismaBatch,
      id: prismaBatch.id.toString(), // Convert BigInt to string
      totalRequests: Number(prismaBatch.totalRequests),
      chainId: Number(prismaBatch.chainId),
      nonce: Number(prismaBatch.nonce),
      tryCount: Number(prismaBatch.tryCount),
    };
  }

  async createBatchTransaction(data: {
    multicallAddress: string;
    totalRequests: number;
    totalAmount: string;
    symbol: string;
    chainId: number;
    nonce: number;
    gasLimit: string;
    status?: string;
  }): Promise<SignedBatchTransaction> {
    const prismaBatch = await this.prisma.signedBatchTransaction.create({
      data: {
        ...data,
        status: data.status || 'PENDING',
      },
    });
    return this.convertToSignedBatchTransaction(prismaBatch);
  }

  async getBatchTransactionById(
    id: string
  ): Promise<SignedBatchTransaction | null> {
    const prismaBatch = await this.prisma.signedBatchTransaction.findUnique({
      where: { id: BigInt(id) },
    });
    return prismaBatch ? this.convertToSignedBatchTransaction(prismaBatch) : null;
  }

  async updateBatchTransaction(
    id: string,
    data: Partial<{
      txHash: string;
      status: string;
      gasUsed: string;
      errorMessage: string;
      nonce: number;
      gasLimit: string;
      maxFeePerGas: string;
      maxPriorityFeePerGas: string;
      broadcastedAt: Date;
      confirmedAt: Date;
    }>
  ): Promise<SignedBatchTransaction> {
    const prismaBatch = await this.prisma.signedBatchTransaction.update({
      where: { id: BigInt(id) },
      data,
    });
    return this.convertToSignedBatchTransaction(prismaBatch);
  }

  async updateBatchStatus(
    id: string,
    status: string
  ): Promise<SignedBatchTransaction> {
    const prismaBatch = await this.prisma.signedBatchTransaction.update({
      where: { id: BigInt(id) },
      data: { status },
    });
    return this.convertToSignedBatchTransaction(prismaBatch);
  }

  async updateBatchStatusWithError(
    id: string,
    status: string,
    errorMessage: string
  ): Promise<SignedBatchTransaction> {
    const prismaBatch = await this.prisma.signedBatchTransaction.update({
      where: { id: BigInt(id) },
      data: {
        status,
        errorMessage,
      },
    });
    return this.convertToSignedBatchTransaction(prismaBatch);
  }

  async updateBatchWithTxHash(
    id: string,
    txHash: string,
    status: string = 'SIGNED'
  ): Promise<SignedBatchTransaction> {
    const prismaBatch = await this.prisma.signedBatchTransaction.update({
      where: { id: BigInt(id) },
      data: {
        txHash,
        status,
      },
    });
    return this.convertToSignedBatchTransaction(prismaBatch);
  }

  async getPendingBatchTransactions(): Promise<SignedBatchTransaction[]> {
    const prismaBatches = await this.prisma.signedBatchTransaction.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    return prismaBatches.map((batch) => this.convertToSignedBatchTransaction(batch));
  }
}
