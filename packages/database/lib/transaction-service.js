"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const library_1 = require("@prisma/client/runtime/library");
class TransactionService {
    constructor(dbService) {
        this.prisma = dbService.getClient();
    }
    convertToTransaction(prismaTx) {
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
    async createTransaction(data) {
        const prismaTx = (await this.prisma.transaction.create({
            data: {
                userId: data.userId,
                amount: new library_1.Decimal(data.amount),
                currency: data.currency,
                status: data.status,
            },
        }));
        return this.convertToTransaction(prismaTx);
    }
    async getTransactionById(id) {
        const prismaTx = (await this.prisma.transaction.findUnique({
            where: { id },
        }));
        return prismaTx ? this.convertToTransaction(prismaTx) : null;
    }
    async getTransactionsByUserId(userId) {
        const prismaTxs = (await this.prisma.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        }));
        return prismaTxs.map((tx) => this.convertToTransaction(tx));
    }
    async updateTransaction(id, data) {
        const prismaTx = (await this.prisma.transaction.update({
            where: { id },
            data: {
                ...data,
                fee: data.fee ? new library_1.Decimal(data.fee) : undefined,
            },
        }));
        return this.convertToTransaction(prismaTx);
    }
    async deleteTransaction(id) {
        const prismaTx = (await this.prisma.transaction.delete({
            where: { id },
        }));
        return this.convertToTransaction(prismaTx);
    }
    async getTransactionsByStatus(status) {
        const prismaTxs = (await this.prisma.transaction.findMany({
            where: { status },
            orderBy: { createdAt: 'desc' },
        }));
        return prismaTxs.map((tx) => this.convertToTransaction(tx));
    }
}
exports.TransactionService = TransactionService;
//# sourceMappingURL=transaction-service.js.map