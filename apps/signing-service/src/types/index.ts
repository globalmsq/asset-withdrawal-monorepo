export interface SignedTransaction {
  transactionId: string; // Maps to requestId in database
  hash: string; // Maps to txHash in database
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
