import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DatabaseService } from './database';

// Service layer types (converted to number)
export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  tokenAddress?: string | null;
  toAddress?: string | null;
  network?: string | null;
  status: string;
  txHash?: string | null;
  blockNumber?: number | null;
  confirmations: number;
  fee?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// Prisma generated type definition
interface PrismaTransaction {
  id: bigint;
  amount: Decimal;
  currency: string;
  tokenAddress: string | null;
  toAddress: string | null;
  network: string | null;
  status: string;
  txHash: string | null;
  blockNumber: number | null;
  confirmations: number;
  fee: Decimal | null;
  createdAt: Date;
  updatedAt: Date;
}

export class TransactionService {
  private prisma: PrismaClient;
  private isDevelopment: boolean;

  constructor(dbService?: DatabaseService) {
    if (dbService) {
      this.prisma = dbService.getClient();
    } else {
      // Create a default DatabaseService if not provided
      const defaultDbService = new DatabaseService();
      this.prisma = defaultDbService.getClient();
    }
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  private convertToTransaction(prismaTx: PrismaTransaction): Transaction {
    return {
      id: prismaTx.id.toString(),
      amount: prismaTx.amount.toNumber(),
      currency: prismaTx.currency,
      tokenAddress: prismaTx.tokenAddress,
      toAddress: prismaTx.toAddress,
      network: prismaTx.network,
      status: prismaTx.status,
      txHash: prismaTx.txHash,
      blockNumber: prismaTx.blockNumber,
      confirmations: prismaTx.confirmations,
      fee: prismaTx.fee?.toNumber() || null,
      createdAt: prismaTx.createdAt,
      updatedAt: prismaTx.updatedAt,
    };
  }

  async createTransaction(data: {
    amount: number;
    currency: string;
    tokenAddress?: string;
    toAddress?: string;
    network?: string;
    status: string;
  }): Promise<Transaction> {
    // Return mock data in development mode
    if (this.isDevelopment) {
      return {
        id: `mock-tx-${Date.now()}`,
        amount: data.amount,
        currency: data.currency,
        tokenAddress: data.tokenAddress || null,
        toAddress: data.toAddress || null,
        network: data.network || null,
        status: data.status,
        txHash: null,
        blockNumber: null,
        confirmations: 0,
        fee: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const prismaTx = await this.prisma.transaction.create({
      data: {
        amount: new Decimal(data.amount),
        currency: data.currency,
        tokenAddress: data.tokenAddress,
        toAddress: data.toAddress,
        network: data.network,
        status: data.status,
      },
    });
    return this.convertToTransaction(prismaTx);
  }

  async getTransactionById(id: string | bigint): Promise<Transaction | null> {
    // Return mock data in development mode
    if (this.isDevelopment) {
      const idStr = typeof id === 'string' ? id : id.toString();
      if (idStr.startsWith('mock-tx-') || idStr === 'non-existent-id') {
        return idStr === 'non-existent-id'
          ? null
          : {
              id: idStr,
              amount: 0.5,
              currency: 'ETH',
              tokenAddress: '0x0000000000000000000000000000000000000000',
              toAddress: '0x742d35Cc6634C0532925a3b8D17B1B6f1C7e2c4A',
              network: 'ethereum',
              status: 'completed',
              txHash: '0x123abc...',
              blockNumber: 12345,
              confirmations: 6,
              fee: 0.001,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
      }
      return null;
    }

    const prismaTx = (await this.prisma.transaction.findUnique({
      where: { id: typeof id === 'string' ? BigInt(id) : id },
    })) as PrismaTransaction | null;
    return prismaTx ? this.convertToTransaction(prismaTx) : null;
  }


  async updateTransaction(
    id: string | bigint,
    data: {
      status?: string;
      txHash?: string;
      blockNumber?: number;
      confirmations?: number;
      fee?: number;
    }
  ): Promise<Transaction> {
    const prismaTx = (await this.prisma.transaction.update({
      where: { id: typeof id === 'string' ? BigInt(id) : id },
      data: {
        ...data,
        fee: data.fee ? new Decimal(data.fee) : undefined,
      },
    })) as PrismaTransaction;
    return this.convertToTransaction(prismaTx);
  }

  async deleteTransaction(id: string | bigint): Promise<Transaction> {
    const prismaTx = (await this.prisma.transaction.delete({
      where: { id: typeof id === 'string' ? BigInt(id) : id },
    })) as PrismaTransaction;
    return this.convertToTransaction(prismaTx);
  }

  async getTransactionsByStatus(status: string): Promise<Transaction[]> {
    const prismaTxs = (await this.prisma.transaction.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    })) as PrismaTransaction[];
    return prismaTxs.map((tx: PrismaTransaction) =>
      this.convertToTransaction(tx)
    );
  }

  async updateStatus(id: string | bigint, status: string): Promise<Transaction> {
    return this.updateTransaction(id, { status });
  }

  async updateTransactionHash(
    id: string | bigint,
    txHash: string
  ): Promise<Transaction> {
    return this.updateTransaction(id, { txHash });
  }
}
