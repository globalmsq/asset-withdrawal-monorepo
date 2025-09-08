import { AmountConverter } from './utils/amount-converter';

export const ValidationPatterns = {
  // Bitcoin address patterns
  BITCOIN_P2PKH: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  BITCOIN_P2SH: /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  BITCOIN_BECH32: /^bc1[a-z0-9]{39,59}$/,

  // Ethereum address pattern
  ETHEREUM: /^0x[a-fA-F0-9]{40}$/,

  // Amount validation
  AMOUNT: /^(\d+(\.\d{1,8})?|\.\d{1,8})$/,
};

export const SupportedNetworks = [
  'ethereum',
  'bitcoin',
  'bsc',
  'polygon',
  'avalanche',
  'arbitrum',
  'optimism',
] as const;

export type NetworkType = (typeof SupportedNetworks)[number];

export function isValidAddress(address: string, network: string): boolean {
  switch (network.toLowerCase()) {
    case 'bitcoin':
      return (
        ValidationPatterns.BITCOIN_P2PKH.test(address) ||
        ValidationPatterns.BITCOIN_P2SH.test(address) ||
        ValidationPatterns.BITCOIN_BECH32.test(address)
      );
    case 'ethereum':
    case 'bsc':
    case 'polygon':
    case 'avalanche':
    case 'arbitrum':
    case 'optimism':
      return ValidationPatterns.ETHEREUM.test(address);
    default:
      return false;
  }
}

/**
 * Validates withdrawal amount with legacy requirements
 * @deprecated Use AmountConverter.validateAmount() with token-specific decimals instead
 * @param amount - Amount string to validate
 * @returns true if valid for withdrawal (max 8 decimals, <= 1M units)
 */
export function isValidWithdrawalAmount(amount: string): boolean {
  // Legacy validation: 8 decimals max, 1M unit limit
  const validation = AmountConverter.validateAmount(amount, 8);
  if (!validation.valid) {
    return false;
  }

  // Additional check for 1M limit (legacy requirement)
  const numAmount = parseFloat(amount);
  return numAmount <= 1000000; // Max 1M units (legacy requirement)
}

export function isValidNetwork(network: string): network is NetworkType {
  return SupportedNetworks.includes(network as NetworkType);
}

export interface FieldValidationError {
  field: string;
  message: string;
}

export function validateWithdrawalRequest(data: any): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  // Required fields
  const requiredFields = ['amount', 'toAddress', 'tokenAddress', 'network'];
  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (errors.length > 0) return errors;

  // Validate amount
  if (!isValidWithdrawalAmount(data.amount)) {
    errors.push({
      field: 'amount',
      message:
        'Invalid amount format. Must be a positive number with up to 8 decimal places',
    });
  }

  // Validate network
  if (!isValidNetwork(data.network)) {
    errors.push({
      field: 'network',
      message: `Unsupported network. Valid networks: ${SupportedNetworks.join(', ')}`,
    });
  }

  // Validate address
  if (!isValidAddress(data.toAddress, data.network)) {
    errors.push({
      field: 'toAddress',
      message: `Invalid ${data.network} address format`,
    });
  }

  // Validate token address for EVM chains
  const evmNetworks = [
    'ethereum',
    'bsc',
    'polygon',
    'avalanche',
    'arbitrum',
    'optimism',
  ];
  if (
    evmNetworks.includes(data.network?.toLowerCase()) &&
    !ValidationPatterns.ETHEREUM.test(data.tokenAddress)
  ) {
    errors.push({
      field: 'tokenAddress',
      message: 'Invalid token contract address',
    });
  }

  // Validate symbol if provided
  if (data.symbol && typeof data.symbol !== 'string') {
    errors.push({
      field: 'symbol',
      message: 'Symbol must be a string',
    });
  }

  if (data.symbol && (data.symbol.length < 1 || data.symbol.length > 10)) {
    errors.push({
      field: 'symbol',
      message: 'Symbol must be between 1 and 10 characters',
    });
  }

  // Validate type if provided
  if (data.type && !['SINGLE', 'BATCH'].includes(data.type)) {
    errors.push({
      field: 'type',
      message: 'Type must be either SINGLE or BATCH',
    });
  }

  // Validate batchId if type is BATCH
  if (data.type === 'BATCH' && !data.batchId) {
    errors.push({
      field: 'batchId',
      message: 'batchId is required for BATCH type withdrawals',
    });
  }

  return errors;
}

export function validateBatchWithdrawalRequest(
  data: any
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  // Required fields
  if (!data.batchId || data.batchId.trim() === '') {
    errors.push({ field: 'batchId', message: 'batchId is required' });
  }

  if (!data.withdrawalRequests || !Array.isArray(data.withdrawalRequests)) {
    errors.push({
      field: 'withdrawalRequests',
      message: 'withdrawalRequests must be an array',
    });
  } else if (data.withdrawalRequests.length === 0) {
    errors.push({
      field: 'withdrawalRequests',
      message: 'withdrawalRequests cannot be empty',
    });
  } else if (data.withdrawalRequests.length > 100) {
    errors.push({
      field: 'withdrawalRequests',
      message: 'Maximum 100 withdrawals per batch',
    });
  } else {
    // Validate each withdrawal request
    data.withdrawalRequests.forEach((request: any, index: number) => {
      const requestErrors = validateWithdrawalRequest(request);
      requestErrors.forEach(error => {
        errors.push({
          field: `withdrawalRequests[${index}].${error.field}`,
          message: error.message,
        });
      });
    });

    // Ensure all requests have the same token and network
    if (data.withdrawalRequests.length > 0) {
      const firstRequest = data.withdrawalRequests[0];
      const tokenAddress = firstRequest.tokenAddress;
      const network = firstRequest.network;

      const inconsistentToken = data.withdrawalRequests.find(
        (req: any) => req.tokenAddress !== tokenAddress
      );
      if (inconsistentToken) {
        errors.push({
          field: 'withdrawalRequests',
          message: 'All withdrawal requests must have the same token address',
        });
      }

      const inconsistentNetwork = data.withdrawalRequests.find(
        (req: any) => req.network !== network
      );
      if (inconsistentNetwork) {
        errors.push({
          field: 'withdrawalRequests',
          message: 'All withdrawal requests must have the same network',
        });
      }
    }
  }

  return errors;
}
