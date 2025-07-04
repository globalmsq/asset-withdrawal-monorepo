import { DatabaseService } from './database';
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
export declare class TransactionService {
    private prisma;
    constructor(dbService: DatabaseService);
    private convertToTransaction;
    createTransaction(data: {
        userId: string;
        amount: number;
        currency: string;
        status: string;
    }): Promise<Transaction>;
    getTransactionById(id: string): Promise<Transaction | null>;
    getTransactionsByUserId(userId: string): Promise<Transaction[]>;
    updateTransaction(id: string, data: {
        status?: string;
        txHash?: string;
        blockNumber?: number;
        confirmations?: number;
        fee?: number;
    }): Promise<Transaction>;
    deleteTransaction(id: string): Promise<Transaction>;
    getTransactionsByStatus(status: string): Promise<Transaction[]>;
}
