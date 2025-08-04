import {
  ValidationPatterns,
  SupportedNetworks,
  isValidAddress,
  isValidAmount,
  isValidNetwork,
  validateWithdrawalRequest,
  validateBatchWithdrawalRequest,
  type NetworkType,
  type FieldValidationError,
} from '../validators';

describe('ValidationPatterns', () => {
  describe('BITCOIN_P2PKH', () => {
    it('should validate legacy Bitcoin addresses', () => {
      const validAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX',
      ];

      validAddresses.forEach(address => {
        expect(ValidationPatterns.BITCOIN_P2PKH.test(address)).toBe(true);
      });
    });

    it('should reject invalid Bitcoin P2PKH addresses', () => {
      const invalidAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        '',
        'invalid-address',
      ];

      invalidAddresses.forEach(address => {
        expect(ValidationPatterns.BITCOIN_P2PKH.test(address)).toBe(false);
      });
    });
  });

  describe('BITCOIN_P2SH', () => {
    it('should validate Bitcoin P2SH addresses', () => {
      const validAddresses = [
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        '3QJmV3qfvL9SuYo34YihAf3sRCW3qSinyC',
        '35hK24tcLEWcgNA4JxpvbkNkoAcDGqQPsP',
      ];

      validAddresses.forEach(address => {
        expect(ValidationPatterns.BITCOIN_P2SH.test(address)).toBe(true);
      });
    });

    it('should reject invalid Bitcoin P2SH addresses', () => {
      const invalidAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        '',
        '3',
        'invalid-address',
      ];

      invalidAddresses.forEach(address => {
        expect(ValidationPatterns.BITCOIN_P2SH.test(address)).toBe(false);
      });
    });
  });

  describe('BITCOIN_BECH32', () => {
    it('should validate Bitcoin Bech32 addresses', () => {
      const validAddresses = [
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      ];

      validAddresses.forEach(address => {
        expect(ValidationPatterns.BITCOIN_BECH32.test(address)).toBe(true);
      });
    });

    it('should reject invalid Bitcoin Bech32 addresses', () => {
      const invalidAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        '',
        'bc1',
        'invalid-address',
      ];

      invalidAddresses.forEach(address => {
        expect(ValidationPatterns.BITCOIN_BECH32.test(address)).toBe(false);
      });
    });
  });

  describe('ETHEREUM', () => {
    it('should validate Ethereum addresses', () => {
      const validAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        '0x0000000000000000000000000000000000000000',
        '0xffffffffffffffffffffffffffffffffffffffff',
        '0x1234567890abcdef1234567890abcdef12345678',
      ];

      validAddresses.forEach(address => {
        expect(ValidationPatterns.ETHEREUM.test(address)).toBe(true);
      });
    });

    it('should reject invalid Ethereum addresses', () => {
      const invalidAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAE', // too short
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEdd', // too long
        '0xZZZd35Cc6634C0532925a3b844Bc9e7595f7fAEd', // invalid hex
        'x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd', // missing 0x
        '',
        'invalid-address',
      ];

      invalidAddresses.forEach(address => {
        expect(ValidationPatterns.ETHEREUM.test(address)).toBe(false);
      });
    });
  });

  describe('AMOUNT', () => {
    it('should validate positive amounts', () => {
      const validAmounts = [
        '1',
        '0.1',
        '1000000',
        '0.12345678',
        '999.99999999',
      ];

      validAmounts.forEach(amount => {
        expect(ValidationPatterns.AMOUNT.test(amount)).toBe(true);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = [
        '-1',
        '1.123456789', // too many decimals
        'abc',
        '1.2.3',
        '',
        '1,000',
        '1e10',
      ];

      invalidAmounts.forEach(amount => {
        expect(ValidationPatterns.AMOUNT.test(amount)).toBe(false);
      });
    });
  });
});

describe('SupportedNetworks', () => {
  it('should contain expected networks', () => {
    const expectedNetworks = [
      'ethereum',
      'bitcoin',
      'bsc',
      'polygon',
      'avalanche',
      'arbitrum',
      'optimism',
    ];

    expectedNetworks.forEach(network => {
      expect(SupportedNetworks).toContain(network);
    });
  });

  it('should have correct length', () => {
    expect(SupportedNetworks.length).toBe(7);
  });
});

describe('isValidAddress', () => {
  describe('Bitcoin network', () => {
    it('should validate all Bitcoin address types', () => {
      const validAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // P2PKH
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // Bech32
      ];

      validAddresses.forEach(address => {
        expect(isValidAddress(address, 'bitcoin')).toBe(true);
      });
    });

    it('should reject invalid Bitcoin addresses', () => {
      const invalidAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        'invalid-address',
        '',
      ];

      invalidAddresses.forEach(address => {
        expect(isValidAddress(address, 'bitcoin')).toBe(false);
      });
    });
  });

  describe('EVM networks', () => {
    const evmNetworks = [
      'ethereum',
      'bsc',
      'polygon',
      'avalanche',
      'arbitrum',
      'optimism',
    ];

    it('should validate Ethereum addresses for all EVM networks', () => {
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd';

      evmNetworks.forEach(network => {
        expect(isValidAddress(validAddress, network)).toBe(true);
      });
    });

    it('should reject invalid addresses for all EVM networks', () => {
      const invalidAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        'invalid-address',
        '',
      ];

      evmNetworks.forEach(network => {
        invalidAddresses.forEach(address => {
          expect(isValidAddress(address, network)).toBe(false);
        });
      });
    });
  });

  describe('Unsupported networks', () => {
    it('should return false for unsupported networks', () => {
      const unsupportedNetworks = ['litecoin', 'dogecoin', 'solana', 'cardano'];
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd';

      unsupportedNetworks.forEach(network => {
        expect(isValidAddress(validAddress, network)).toBe(false);
      });
    });
  });

  describe('Case sensitivity', () => {
    it('should be case insensitive for network names', () => {
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd';

      expect(isValidAddress(validAddress, 'ETHEREUM')).toBe(true);
      expect(isValidAddress(validAddress, 'Ethereum')).toBe(true);
      expect(isValidAddress(validAddress, 'ethereum')).toBe(true);
      expect(isValidAddress(validAddress, 'BITCOIN')).toBe(false);
    });
  });
});

describe('isValidAmount', () => {
  it('should validate positive amounts within range', () => {
    const validAmounts = [
      '0.1',
      '1',
      '100',
      '1000',
      '999999',
      '1000000', // max limit
      '0.00000001',
      '123.456789',
    ];

    validAmounts.forEach(amount => {
      expect(isValidAmount(amount)).toBe(true);
    });
  });

  it('should reject amounts outside valid range', () => {
    const invalidAmounts = [
      '0',
      '-1',
      '1000001', // over max limit
      '1000000.1', // over max limit
      'abc',
      '',
      '1.123456789', // too many decimals
      '1,000',
      '1e10',
    ];

    invalidAmounts.forEach(amount => {
      expect(isValidAmount(amount)).toBe(false);
    });
  });
});

describe('isValidNetwork', () => {
  it('should validate supported networks', () => {
    SupportedNetworks.forEach(network => {
      expect(isValidNetwork(network)).toBe(true);
    });
  });

  it('should reject unsupported networks', () => {
    const unsupportedNetworks = [
      'litecoin',
      'dogecoin',
      'solana',
      'cardano',
      '',
    ];

    unsupportedNetworks.forEach(network => {
      expect(isValidNetwork(network)).toBe(false);
    });
  });
});

describe('validateWithdrawalRequest', () => {
  const validRequestData = {
    amount: '1.5',
    toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
    tokenAddress: '0x0000000000000000000000000000000000000000',
    network: 'ethereum',
  };

  it('should return empty array for valid request', () => {
    const errors = validateWithdrawalRequest(validRequestData);
    expect(errors).toEqual([]);
  });

  it('should return errors for missing required fields', () => {
    const invalidData = {
      // missing all required fields
    };

    const errors = validateWithdrawalRequest(invalidData);

    expect(errors).toHaveLength(4);
    expect(errors.map(e => e.field)).toContain('amount');
    expect(errors.map(e => e.field)).toContain('toAddress');
    expect(errors.map(e => e.field)).toContain('tokenAddress');
    expect(errors.map(e => e.field)).toContain('network');
  });

  it('should validate amount format', () => {
    const invalidData = {
      ...validRequestData,
      amount: 'invalid-amount',
    };

    const errors = validateWithdrawalRequest(invalidData);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('amount');
    expect(errors[0].message).toContain('Invalid amount format');
  });

  it('should validate network support', () => {
    const invalidData = {
      ...validRequestData,
      network: 'unsupported-network',
    };

    const errors = validateWithdrawalRequest(invalidData);

    expect(errors.length).toBeGreaterThan(0);
    const networkError = errors.find(e => e.field === 'network');
    expect(networkError).toBeDefined();
    expect(networkError?.message).toContain('Unsupported network');
  });

  it('should validate address format for network', () => {
    const invalidData = {
      ...validRequestData,
      network: 'bitcoin',
      toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd', // Ethereum address on Bitcoin network
    };

    const errors = validateWithdrawalRequest(invalidData);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('toAddress');
    expect(errors[0].message).toContain('Invalid bitcoin address format');
  });

  it('should validate token address for EVM networks', () => {
    const invalidData = {
      ...validRequestData,
      tokenAddress: 'invalid-token-address',
    };

    const errors = validateWithdrawalRequest(invalidData);

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('tokenAddress');
    expect(errors[0].message).toContain('Invalid token contract address');
  });

  it('should return multiple errors for multiple invalid fields', () => {
    const invalidData = {
      amount: 'invalid',
      toAddress: 'invalid-address',
      tokenAddress: 'invalid-token',
      network: 'unsupported',
    };

    const errors = validateWithdrawalRequest(invalidData);

    expect(errors.length).toBeGreaterThan(0);
    const fields = errors.map(e => e.field);
    expect(fields).toContain('amount');
    expect(fields).toContain('network');
    expect(fields).toContain('toAddress');
    // tokenAddress validation depends on network being valid first
  });

  it('should handle Bitcoin network validation correctly', () => {
    const bitcoinData = {
      amount: '0.5',
      toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      tokenAddress: 'BTC', // Bitcoin doesn't use token addresses like EVM chains
      network: 'bitcoin',
    };

    const errors = validateWithdrawalRequest(bitcoinData);

    // Should only validate the required fields, not token address for Bitcoin
    expect(errors.length).toBe(0);
  });
});

describe('FieldValidationError interface', () => {
  it('should match expected structure', () => {
    const error: FieldValidationError = {
      field: 'amount',
      message: 'Invalid amount',
    };

    expect(error.field).toBe('amount');
    expect(error.message).toBe('Invalid amount');
  });
});

describe('NetworkType', () => {
  it('should accept valid network types', () => {
    const validNetworks: NetworkType[] = [
      'ethereum',
      'bitcoin',
      'bsc',
      'polygon',
      'avalanche',
      'arbitrum',
      'optimism',
    ];

    validNetworks.forEach(network => {
      expect(SupportedNetworks).toContain(network);
    });
  });
});

describe('validateWithdrawalRequest with batch fields', () => {
  const validRequestData = {
    amount: '100.5',
    toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
    tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    network: 'polygon',
  };

  it('should validate type field', () => {
    const dataWithInvalidType = {
      ...validRequestData,
      type: 'INVALID',
    };

    const errors = validateWithdrawalRequest(dataWithInvalidType);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('type');
    expect(errors[0].message).toBe('Type must be either SINGLE or BATCH');
  });

  it('should accept valid type values', () => {
    const singleData = {
      ...validRequestData,
      type: 'SINGLE',
    };

    const batchData = {
      ...validRequestData,
      type: 'BATCH',
      batchId: 'batch-123',
    };

    expect(validateWithdrawalRequest(singleData)).toHaveLength(0);
    expect(validateWithdrawalRequest(batchData)).toHaveLength(0);
  });

  it('should require batchId for BATCH type', () => {
    const batchDataWithoutId = {
      ...validRequestData,
      type: 'BATCH',
    };

    const errors = validateWithdrawalRequest(batchDataWithoutId);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('batchId');
    expect(errors[0].message).toBe(
      'batchId is required for BATCH type withdrawals'
    );
  });

  it('should not require batchId for SINGLE type', () => {
    const singleData = {
      ...validRequestData,
      type: 'SINGLE',
    };

    const errors = validateWithdrawalRequest(singleData);
    expect(errors).toHaveLength(0);
  });
});

describe('validateBatchWithdrawalRequest', () => {
  const validWithdrawalRequest = {
    amount: '100.5',
    toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
    tokenAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    network: 'polygon',
  };

  const validBatchRequest = {
    batchId: 'batch-123',
    withdrawalRequests: [
      validWithdrawalRequest,
      { ...validWithdrawalRequest, amount: '200.75' },
    ],
  };

  it('should validate a valid batch request', () => {
    const errors = validateBatchWithdrawalRequest(validBatchRequest);
    expect(errors).toHaveLength(0);
  });

  it('should require batchId', () => {
    const dataWithoutBatchId = {
      ...validBatchRequest,
      batchId: undefined,
    };

    const errors = validateBatchWithdrawalRequest(dataWithoutBatchId);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('batchId');
    expect(errors[0].message).toBe('batchId is required');
  });

  it('should require withdrawalRequests to be an array', () => {
    const dataWithInvalidRequests = {
      batchId: 'batch-123',
      withdrawalRequests: 'not-an-array',
    };

    const errors = validateBatchWithdrawalRequest(dataWithInvalidRequests);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('withdrawalRequests');
    expect(errors[0].message).toBe('withdrawalRequests must be an array');
  });

  it('should not allow empty withdrawalRequests array', () => {
    const dataWithEmptyRequests = {
      batchId: 'batch-123',
      withdrawalRequests: [],
    };

    const errors = validateBatchWithdrawalRequest(dataWithEmptyRequests);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('withdrawalRequests');
    expect(errors[0].message).toBe('withdrawalRequests cannot be empty');
  });

  it('should enforce maximum batch size of 100', () => {
    const largeRequests = Array(101).fill(validWithdrawalRequest);
    const dataWithTooManyRequests = {
      batchId: 'batch-123',
      withdrawalRequests: largeRequests,
    };

    const errors = validateBatchWithdrawalRequest(dataWithTooManyRequests);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('withdrawalRequests');
    expect(errors[0].message).toBe('Maximum 100 withdrawals per batch');
  });

  it('should validate each withdrawal request', () => {
    const dataWithInvalidRequest = {
      batchId: 'batch-123',
      withdrawalRequests: [
        validWithdrawalRequest,
        {
          ...validWithdrawalRequest,
          amount: 'invalid-amount',
        },
      ],
    };

    const errors = validateBatchWithdrawalRequest(dataWithInvalidRequest);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('withdrawalRequests[1].amount');
    expect(errors[0].message).toContain('Invalid amount format');
  });

  it('should require all requests to have the same token address', () => {
    const dataWithDifferentTokens = {
      batchId: 'batch-123',
      withdrawalRequests: [
        validWithdrawalRequest,
        {
          ...validWithdrawalRequest,
          tokenAddress: '0x0000000000000000000000000000000000000000',
        },
      ],
    };

    const errors = validateBatchWithdrawalRequest(dataWithDifferentTokens);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('withdrawalRequests');
    expect(errors[0].message).toBe(
      'All withdrawal requests must have the same token address'
    );
  });

  it('should require all requests to have the same network', () => {
    const dataWithDifferentNetworks = {
      batchId: 'batch-123',
      withdrawalRequests: [
        validWithdrawalRequest,
        {
          ...validWithdrawalRequest,
          network: 'ethereum',
        },
      ],
    };

    const errors = validateBatchWithdrawalRequest(dataWithDifferentNetworks);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('withdrawalRequests');
    expect(errors[0].message).toBe(
      'All withdrawal requests must have the same network'
    );
  });

  it('should handle multiple validation errors', () => {
    const dataWithMultipleErrors = {
      batchId: '',
      withdrawalRequests: [
        {
          amount: 'invalid-amount-format',
          toAddress: 'invalid-address',
          tokenAddress: 'not-a-valid-token-address',
          network: 'unsupported-network',
        },
      ],
    };

    const errors = validateBatchWithdrawalRequest(dataWithMultipleErrors);
    expect(errors.length).toBeGreaterThan(1);

    // Check for specific errors
    const errorFields = errors.map(e => e.field);
    expect(errorFields).toContain('batchId');

    // Since we're providing invalid values (not missing values),
    // we should get format/validation errors
    const errorMessages = errors.map(e => e.message);
    expect(errorMessages.some(msg => msg.includes('batchId is required'))).toBe(
      true
    );
    expect(
      errorMessages.some(msg => msg.includes('Invalid amount format'))
    ).toBe(true);
    expect(errorMessages.some(msg => msg.includes('Unsupported network'))).toBe(
      true
    );
  });
});
