export enum TransactionStatus {
  PENDING = 'PENDING',
  VALIDATING = 'VALIDATING',
  SIGNING = 'SIGNING',
  SIGNED = 'SIGNED',
  BROADCASTING = 'BROADCASTING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum WithdrawalType {
  SINGLE = 'SINGLE',
  BATCH = 'BATCH',
}

export interface WithdrawalRequest {
  id: string;
  amount: string;
  toAddress: string;
  tokenAddress: string;
  symbol?: string;
  network: string;
  chain?: string; // Chain name (e.g., 'polygon', 'localhost')
  type?: WithdrawalType;
  processingMode?: string;
  batchId?: string;
  tryCount?: number;
  createdAt?: Date;
}

export interface WithdrawalResponse {
  id: string;
  status: TransactionStatus;
  transactionHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueMessage<T = any> {
  id: string;
  data: T;
  timestamp: Date;
  retryCount: number;
}

export interface DatabaseTransaction {
  id: string;
  amount: string;
  toAddress: string;
  tokenAddress: string;
  network: string;
  status: TransactionStatus;
  transactionHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: any;
  timestamp: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  expiresIn: number;
}

export interface BatchWithdrawalRequest {
  batchId: string;
  withdrawalRequests: WithdrawalRequest[];
  totalAmount: string;
  tokenAddress: string;
  network: string;
  createdAt?: Date;
}

export interface BatchTransactionStatus {
  batchId: string;
  status: TransactionStatus;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  txHash?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
