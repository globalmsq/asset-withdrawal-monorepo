import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DatabaseService } from './database';

// Service layer types (converted to number)
export interface Transaction {
  id: string;
  amount: number;
  symbol: string;
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
  symbol: string;
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

  constructor(prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
    } else {
      // Fallback: DatabaseService의 싱글톤 인스턴스를 사용
      const dbService = DatabaseService.getInstance();
      this.prisma = dbService.getClient();
    }
  }

  private convertToTransaction(prismaTx: PrismaTransaction): Transaction {
    return {
      id: prismaTx.id.toString(),
      amount: prismaTx.amount.toNumber(),
      symbol: prismaTx.symbol,
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
    symbol: string;
    tokenAddress?: string;
    toAddress?: string;
    network?: string;
    status: string;
  }): Promise<Transaction> {
    const prismaTx = await this.prisma.transaction.create({
      data: {
        amount: new Decimal(data.amount),
        symbol: data.symbol,
        tokenAddress: data.tokenAddress,
        toAddress: data.toAddress,
        network: data.network,
        status: data.status,
      },
    });
    return this.convertToTransaction(prismaTx);
  }

  async getTransactionById(id: string | bigint): Promise<Transaction | null> {
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

  async updateStatus(
    id: string | bigint,
    status: string
  ): Promise<Transaction> {
    return this.updateTransaction(id, { status });
  }

  async updateTransactionHash(
    id: string | bigint,
    txHash: string
  ): Promise<Transaction> {
    return this.updateTransaction(id, { txHash });
  }

  // Methods for working with requestId (withdrawal request UUID)
  async getTransactionByRequestId(
    requestId: string
  ): Promise<Transaction | null> {
    const prismaTx = (await this.prisma.transaction.findFirst({
      where: { requestId },
    })) as PrismaTransaction | null;
    return prismaTx ? this.convertToTransaction(prismaTx) : null;
  }

  async updateStatusByRequestId(
    requestId: string,
    status: string
  ): Promise<Transaction> {
    // First find the transaction by requestId
    const transaction = await this.prisma.transaction.findFirst({
      where: { requestId },
    });

    if (!transaction) {
      throw new Error(`Transaction not found for requestId: ${requestId}`);
    }

    // Then update using the id
    const prismaTx = (await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status },
    })) as PrismaTransaction;
    return this.convertToTransaction(prismaTx);
  }

  async updateTransactionHashByRequestId(
    requestId: string,
    txHash: string
  ): Promise<Transaction> {
    // First find the transaction by requestId
    const transaction = await this.prisma.transaction.findFirst({
      where: { requestId },
    });

    if (!transaction) {
      throw new Error(`Transaction not found for requestId: ${requestId}`);
    }

    // Then update using the id
    const prismaTx = (await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { txHash },
    })) as PrismaTransaction;
    return this.convertToTransaction(prismaTx);
  }
}
