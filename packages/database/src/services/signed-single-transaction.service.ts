import { PrismaClient, SignedSingleTransaction, Prisma } from '@prisma/client';
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
  amount: string;
  symbol: string;
  data?: string;
  chainId: number;
  tryCount?: number;
  status?: string;
  errorMessage?: string;
}

export interface UpdateSignedTransactionDto {
  status?: string;
  gasUsed?: string;
  errorMessage?: string;
  broadcastedAt?: Date;
  confirmedAt?: Date;
}

export class SignedSingleTransactionService {
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

  async create(
    data: CreateSignedTransactionDto
  ): Promise<SignedSingleTransaction> {
    return this.prisma.signedSingleTransaction.create({
      data: {
        ...data,
        status: data.status || 'SIGNED',
      },
    });
  }

  async findByRequestId(requestId: string): Promise<SignedSingleTransaction[]> {
    return this.prisma.signedSingleTransaction.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByTxHash(txHash: string): Promise<SignedSingleTransaction | null> {
    return this.prisma.signedSingleTransaction.findFirst({
      where: { txHash },
    });
  }

  async getLatestByRequestId(
    requestId: string
  ): Promise<SignedSingleTransaction | null> {
    return this.prisma.signedSingleTransaction.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: bigint,
    data: UpdateSignedTransactionDto
  ): Promise<SignedSingleTransaction> {
    return this.prisma.signedSingleTransaction.update({
      where: { id },
      data,
    });
  }

  async updateStatusByTxHash(
    txHash: string,
    data: UpdateSignedTransactionDto
  ): Promise<SignedSingleTransaction> {
    // Since txHash is not unique, we need to find first and then update
    const transaction = await this.prisma.signedSingleTransaction.findFirst({
      where: { txHash },
    });

    if (!transaction) {
      throw new Error(
        `SignedSingleTransaction with txHash ${txHash} not found`
      );
    }

    return this.prisma.signedSingleTransaction.update({
      where: { id: transaction.id },
      data,
    });
  }

  async countByStatus(status: string): Promise<number> {
    return this.prisma.signedSingleTransaction.count({
      where: { status },
    });
  }

  async getRecentSignedTransactions(
    limit: number = 10
  ): Promise<SignedSingleTransaction[]> {
    return this.prisma.signedSingleTransaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByRequestIdAndStatus(
    requestId: string,
    status: string
  ): Promise<SignedSingleTransaction[]> {
    return this.prisma.signedSingleTransaction.findMany({
      where: {
        requestId,
        status,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
