export interface WithdrawalRequest {
  id: string;
  amount: string;
  toAddress: string;
  tokenAddress: string;
  symbol?: string;
  network: string;
  createdAt?: Date;
}

export interface SignedTransaction {
  withdrawalId: string;
  signedTx: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  gasLimit: string;
  nonce: number;
  chainId: number;
}
