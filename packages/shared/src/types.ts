export enum TransactionStatus {
  PENDING = 'PENDING',
  VALIDATING = 'VALIDATING',
  SIGNED = 'SIGNED',
  BROADCASTING = 'BROADCASTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: string;
  toAddress: string;
  tokenAddress: string;
  network: string;
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
  userId: string;
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
