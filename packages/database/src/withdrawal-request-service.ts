import { PrismaClient, Prisma } from '@prisma/client';
import type { WithdrawalRequest as PrismaWithdrawalRequest } from '@prisma/client';
import { DatabaseService } from './database';

export interface WithdrawalRequest {
  id: string;
  requestId: string;
  amount: string;
  symbol: string;
  toAddress: string;
  tokenAddress: string;
  chain: string;
  network: string;
  status: string;
  processingMode: string;
  batchId: string | null;
  tryCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class WithdrawalRequestService {
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

  private convertToWithdrawalRequest(
    prismaRequest: PrismaWithdrawalRequest
  ): WithdrawalRequest {
    return {
      ...prismaRequest,
      id: prismaRequest.id.toString(),
      tryCount: Number(prismaRequest.tryCount),
      chain: (prismaRequest as any).chain || 'polygon', // Default to polygon for backward compatibility
    };
  }

  async getWithdrawalRequestByRequestId(
    requestId: string
  ): Promise<WithdrawalRequest | null> {
    const prismaRequest = await this.prisma.withdrawalRequest.findUnique({
      where: { requestId },
    });
    return prismaRequest
      ? this.convertToWithdrawalRequest(prismaRequest)
      : null;
  }

  async updateStatus(
    requestId: string,
    status: string
  ): Promise<WithdrawalRequest> {
    const prismaRequest = await this.prisma.withdrawalRequest.update({
      where: { requestId },
      data: { status },
    });
    return this.convertToWithdrawalRequest(prismaRequest);
  }

  async updateStatusWithError(
    requestId: string,
    status: string,
    errorMessage: string
  ): Promise<WithdrawalRequest> {
    const prismaRequest = await this.prisma.withdrawalRequest.update({
      where: { requestId },
      data: {
        status,
        errorMessage,
      },
    });
    return this.convertToWithdrawalRequest(prismaRequest);
  }

  async createWithdrawalRequest(data: {
    requestId: string;
    amount: string;
    symbol: string;
    toAddress: string;
    tokenAddress: string;
    chain: string;
    network: string;
    status?: string;
    processingMode?: string;
    batchId?: string;
  }): Promise<WithdrawalRequest> {
    const prismaRequest = await this.prisma.withdrawalRequest.create({
      data: {
        ...data,
        status: data.status || 'PENDING',
        processingMode: data.processingMode || 'SINGLE',
      },
    });
    return this.convertToWithdrawalRequest(prismaRequest);
  }

  async getWithdrawalRequestsByBatchId(
    batchId: string
  ): Promise<WithdrawalRequest[]> {
    const prismaRequests = await this.prisma.withdrawalRequest.findMany({
      where: { batchId },
      orderBy: { createdAt: 'asc' },
    });
    return prismaRequests.map(req => this.convertToWithdrawalRequest(req));
  }

  async createBatchWithdrawalRequests(
    requests: Array<{
      requestId: string;
      amount: string;
      symbol: string;
      toAddress: string;
      tokenAddress: string;
      chain: string;
      network: string;
      batchId: string;
    }>
  ): Promise<WithdrawalRequest[]> {
    const prismaRequests = await this.prisma.$transaction(
      requests.map(req =>
        this.prisma.withdrawalRequest.create({
          data: {
            ...req,
            status: 'PENDING',
            processingMode: 'BATCH',
          },
        })
      )
    );
    return prismaRequests.map(req => this.convertToWithdrawalRequest(req));
  }

  async updateBatchStatus(
    batchId: string,
    status: string
  ): Promise<Prisma.BatchPayload> {
    return await this.prisma.withdrawalRequest.updateMany({
      where: { batchId },
      data: { status },
    });
  }

  async updateBatchStatusWithError(
    batchId: string,
    status: string,
    errorMessage: string
  ): Promise<Prisma.BatchPayload> {
    return await this.prisma.withdrawalRequest.updateMany({
      where: { batchId },
      data: {
        status,
        errorMessage,
      },
    });
  }
}
