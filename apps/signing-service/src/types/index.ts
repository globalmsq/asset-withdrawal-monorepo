export interface SignedTransaction {
  transactionId: string;
  hash: string;
  rawTransaction: string;
  nonce: number;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}
