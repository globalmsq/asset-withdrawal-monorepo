export interface WithdrawalRequest {
  id: string;
  userId: string;
  address: string;
  amount: string;
  network: string;
  tokenAddress?: string;
  status: string;
  createdAt: Date;
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