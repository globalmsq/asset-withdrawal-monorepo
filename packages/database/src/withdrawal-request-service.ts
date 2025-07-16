import { PrismaClient, Prisma } from '@prisma/client';
import type { WithdrawalRequest as PrismaWithdrawalRequest } from '@prisma/client';

export interface WithdrawalRequest {
  id: string;
  requestId: string;
  amount: string;
  symbol: string;
  toAddress: string;
  tokenAddress: string;
  network: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class WithdrawalRequestService {
  constructor(private prisma: PrismaClient = new PrismaClient()) {}

  private convertToWithdrawalRequest(prismaRequest: PrismaWithdrawalRequest): WithdrawalRequest {
    return {
      ...prismaRequest,
      id: prismaRequest.id.toString(),
    };
  }

  async getWithdrawalRequestByRequestId(requestId: string): Promise<WithdrawalRequest | null> {
    const prismaRequest = await this.prisma.withdrawalRequest.findUnique({
      where: { requestId },
    });
    return prismaRequest ? this.convertToWithdrawalRequest(prismaRequest) : null;
  }

  async updateStatus(requestId: string, status: string): Promise<WithdrawalRequest> {
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
    network: string;
    status?: string;
  }): Promise<WithdrawalRequest> {
    const prismaRequest = await this.prisma.withdrawalRequest.create({
      data: {
        ...data,
        status: data.status || 'PENDING',
      },
    });
    return this.convertToWithdrawalRequest(prismaRequest);
  }
}