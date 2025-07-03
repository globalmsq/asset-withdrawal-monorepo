import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DatabaseService } from './database';

// Service layer types (converted to number)
export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  currency: string;
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
  id: string;
  userId: string;
  amount: Decimal;
  currency: string;
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

  constructor() {
    this.prisma = DatabaseService.getInstance().getClient();
  }

  private convertToTransaction(prismaTx: PrismaTransaction): Transaction {
    return {
      id: prismaTx.id,
      userId: prismaTx.userId,
      amount: prismaTx.amount.toNumber(),
      currency: prismaTx.currency,
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
    userId: string;
    amount: number;
    currency: string;
    status: string;
  }): Promise<Transaction> {
    const prismaTx = (await this.prisma.transaction.create({
      data: {
        userId: data.userId,
        amount: new Decimal(data.amount),
        currency: data.currency,
        status: data.status,
      },
    })) as PrismaTransaction;
    return this.convertToTransaction(prismaTx);
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    const prismaTx = (await this.prisma.transaction.findUnique({
      where: { id },
    })) as PrismaTransaction | null;
    return prismaTx ? this.convertToTransaction(prismaTx) : null;
  }

  async getTransactionsByUserId(userId: string): Promise<Transaction[]> {
    const prismaTxs = (await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })) as PrismaTransaction[];
    return prismaTxs.map((tx: PrismaTransaction) =>
      this.convertToTransaction(tx)
    );
  }

  async updateTransaction(
    id: string,
    data: {
      status?: string;
      txHash?: string;
      blockNumber?: number;
      confirmations?: number;
      fee?: number;
    }
  ): Promise<Transaction> {
    const prismaTx = (await this.prisma.transaction.update({
      where: { id },
      data: {
        ...data,
        fee: data.fee ? new Decimal(data.fee) : undefined,
      },
    })) as PrismaTransaction;
    return this.convertToTransaction(prismaTx);
  }

  async deleteTransaction(id: string): Promise<Transaction> {
    const prismaTx = (await this.prisma.transaction.delete({
      where: { id },
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
}
