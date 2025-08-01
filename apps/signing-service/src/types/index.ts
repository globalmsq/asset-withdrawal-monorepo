export interface SignedTransaction {
  transactionType: 'SINGLE' | 'BATCH';
  requestId: string;        // For individual transactions (replaces withdrawalId)
  batchId?: string;         // For batch transactions (optional)
  hash: string;             // Maps to txHash in database
  rawTransaction: string;
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
