import { PrismaClient, Prisma, SentTransaction } from '@prisma/client';
import { DatabaseService } from '../database';

export interface CreateSentTransactionInput {
  requestId?: string;
  batchId?: string;
  transactionType: 'SINGLE' | 'BATCH';
  originalTxHash: string;
  sentTxHash: string;
  chain: string;
  network: string;
  nonce: number;
  blockNumber?: bigint;
  gasUsed?: string;
  status?: string;
  error?: string;
  confirmedAt?: Date;
}

export interface UpdateSentTransactionInput {
  status?: string;
  nonce?: number;
  blockNumber?: bigint;
  gasUsed?: string;
  error?: string;
  confirmedAt?: Date;
}

export class SentTransactionService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || DatabaseService.getInstance().getClient();
  }

  /**
   * Create a new sent transaction record
   */
  async create(data: CreateSentTransactionInput): Promise<SentTransaction> {
    return await this.prisma.sentTransaction.create({
      data: {
        ...data,
        status: data.status || 'SENT',
      },
    });
  }

  /**
   * Update sent transaction status
   */
  async updateStatus(
    sentTxHash: string,
    data: UpdateSentTransactionInput
  ): Promise<SentTransaction | null> {
    try {
      return await this.prisma.sentTransaction.update({
        where: { sentTxHash },
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get sent transaction by request ID
   */
  async getByRequestId(requestId: string): Promise<SentTransaction | null> {
    return await this.prisma.sentTransaction.findFirst({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get sent transactions by batch ID
   */
  async getByBatchId(batchId: string): Promise<SentTransaction[]> {
    return await this.prisma.sentTransaction.findMany({
      where: { batchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get sent transaction by sent transaction hash
   */
  async getBySentTxHash(sentTxHash: string): Promise<SentTransaction | null> {
    return await this.prisma.sentTransaction.findUnique({
      where: { sentTxHash },
    });
  }

  /**
   * Get sent transaction by original transaction hash
   */
  async getByOriginalTxHash(
    originalTxHash: string
  ): Promise<SentTransaction | null> {
    return await this.prisma.sentTransaction.findFirst({
      where: { originalTxHash },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get sent transactions by status
   */
  async getByStatus(status: string): Promise<SentTransaction[]> {
    return await this.prisma.sentTransaction.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get sent transactions by chain and network
   */
  async getByChainAndNetwork(
    chain: string,
    network: string
  ): Promise<SentTransaction[]> {
    return await this.prisma.sentTransaction.findMany({
      where: { chain, network },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update sent transaction to confirmed status
   */
  async markAsConfirmed(
    sentTxHash: string,
    blockNumber: bigint,
    gasUsed?: string
  ): Promise<SentTransaction | null> {
    return await this.updateStatus(sentTxHash, {
      status: 'CONFIRMED',
      blockNumber,
      gasUsed,
      confirmedAt: new Date(),
    });
  }

  /**
   * Update sent transaction to failed status
   */
  async markAsFailed(
    sentTxHash: string,
    error: string
  ): Promise<SentTransaction | null> {
    return await this.updateStatus(sentTxHash, {
      status: 'FAILED',
      error,
    });
  }

  /**
   * Check if a transaction has been sent
   */
  async isSent(originalTxHash: string): Promise<boolean> {
    const sentTx = await this.getByOriginalTxHash(originalTxHash);
    return sentTx !== null;
  }

  /**
   * Get recent sent transactions with pagination
   */
  async getRecent(
    take: number = 10,
    skip: number = 0
  ): Promise<SentTransaction[]> {
    return await this.prisma.sentTransaction.findMany({
      take,
      skip,
      orderBy: { createdAt: 'desc' },
    });
  }
}
