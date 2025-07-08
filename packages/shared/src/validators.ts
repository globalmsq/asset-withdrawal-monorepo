export const ValidationPatterns = {
  // Bitcoin address patterns
  BITCOIN_P2PKH: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  BITCOIN_P2SH: /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,
  BITCOIN_BECH32: /^bc1[a-z0-9]{39,59}$/,

  // Ethereum address pattern
  ETHEREUM: /^0x[a-fA-F0-9]{40}$/,

  // Amount validation
  AMOUNT: /^\d+(\.\d{1,8})?$/,
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

export function isValidAmount(amount: string): boolean {
  if (!ValidationPatterns.AMOUNT.test(amount)) {
    return false;
  }
  const numAmount = parseFloat(amount);
  return numAmount > 0 && numAmount <= 1000000; // Max 1M units
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
  const requiredFields = [
    'userId',
    'amount',
    'toAddress',
    'tokenAddress',
    'network',
  ];
  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (errors.length > 0) return errors;

  // Validate amount
  if (!isValidAmount(data.amount)) {
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

  return errors;
}
