export interface WithdrawalRequest {
  id: string;
  amount: string;
  toAddress: string;
  tokenAddress: string;
  symbol?: string;
  network: string;
  chain?: string;
  createdAt?: Date;
}

export interface SignedTransaction {
  transactionType: 'SINGLE' | 'BATCH';
  requestId: string; // For individual transactions (replaces withdrawalId)
  batchId?: string; // For batch transactions (optional)
  hash: string;
  rawTransaction: string; // Standardized field name (replaces signedTx)
  nonce: number;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  from: string;
  to: string;
  value: string;
  data?: string;
  chainId: number;
}
