import { PrismaClient, SignedTransaction, Prisma } from '@prisma/client';
import { DatabaseService } from '../database';

export interface CreateSignedTransactionDto {
  requestId: string;
  txHash: string;
  nonce: number;
  gasLimit: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  from: string;
  to: string;
  value: string;
  data?: string;
  chainId: number;
  retryCount?: number;
  status?: string;
  errorMessage?: string;
}

export interface UpdateSignedTransactionDto {
  status?: string;
  errorMessage?: string;
  broadcastedAt?: Date;
  confirmedAt?: Date;
}

export class SignedTransactionService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    } else {
      // Fallback: Use DatabaseService singleton instance
      const dbService = DatabaseService.getInstance();
      this.prisma = dbService.getClient();
    }
  }

  async create(data: CreateSignedTransactionDto): Promise<SignedTransaction> {
    return this.prisma.signedTransaction.create({
      data: {
        ...data,
        status: data.status || 'SIGNED',
      },
    });
  }

  async findByRequestId(requestId: string): Promise<SignedTransaction[]> {
    return this.prisma.signedTransaction.findMany({
      where: { requestId },
      orderBy: { signedAt: 'desc' },
    });
  }

  async findByTxHash(txHash: string): Promise<SignedTransaction | null> {
    return this.prisma.signedTransaction.findFirst({
      where: { txHash },
    });
  }

  async getLatestByRequestId(requestId: string): Promise<SignedTransaction | null> {
    return this.prisma.signedTransaction.findFirst({
      where: { requestId },
      orderBy: { signedAt: 'desc' },
    });
  }

  async updateStatus(
    id: bigint,
    data: UpdateSignedTransactionDto
  ): Promise<SignedTransaction> {
    return this.prisma.signedTransaction.update({
      where: { id },
      data,
    });
  }

  async updateStatusByTxHash(
    txHash: string,
    data: UpdateSignedTransactionDto
  ): Promise<SignedTransaction> {
    // Since txHash is not unique, we need to find first and then update
    const transaction = await this.prisma.signedTransaction.findFirst({
      where: { txHash },
    });

    if (!transaction) {
      throw new Error(`SignedTransaction with txHash ${txHash} not found`);
    }

    return this.prisma.signedTransaction.update({
      where: { id: transaction.id },
      data,
    });
  }

  async countByStatus(status: string): Promise<number> {
    return this.prisma.signedTransaction.count({
      where: { status },
    });
  }

  async getRecentSignedTransactions(limit: number = 10): Promise<SignedTransaction[]> {
    return this.prisma.signedTransaction.findMany({
      take: limit,
      orderBy: { signedAt: 'desc' },
    });
  }

  async getByRequestIdAndStatus(
    requestId: string,
    status: string
  ): Promise<SignedTransaction[]> {
    return this.prisma.signedTransaction.findMany({
      where: {
        requestId,
        status,
      },
      orderBy: { signedAt: 'desc' },
    });
  }

  async incrementRetryCount(id: bigint): Promise<SignedTransaction> {
    return this.prisma.signedTransaction.update({
      where: { id },
      data: {
        retryCount: {
          increment: 1,
        },
      },
    });
  }
}
