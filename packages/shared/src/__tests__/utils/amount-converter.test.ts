import { AmountConverter } from '../../utils/amount-converter';
import { parseUnits } from 'ethers';

describe('AmountConverter', () => {
  describe('toWei', () => {
    it('should convert USDC amount (6 decimals)', () => {
      expect(AmountConverter.toWei('1.5', 6)).toBe('1500000');
      expect(AmountConverter.toWei('0.1', 6)).toBe('100000');
      expect(AmountConverter.toWei('1000.123456', 6)).toBe('1000123456');
    });

    it('should convert ETH amount (18 decimals)', () => {
      expect(AmountConverter.toWei('1.0', 18)).toBe('1000000000000000000');
      expect(AmountConverter.toWei('0.5', 18)).toBe('500000000000000000');
      expect(AmountConverter.toWei('0.000000000000000001', 18)).toBe('1');
    });

    it('should handle whole numbers', () => {
      expect(AmountConverter.toWei('5', 6)).toBe('5000000');
      expect(AmountConverter.toWei('100', 18)).toBe('100000000000000000000');
    });

    it('should throw error for invalid amount', () => {
      expect(() => AmountConverter.toWei('abc', 6)).toThrow();
      expect(() => AmountConverter.toWei('', 6)).toThrow();
      // Note: ethers.parseUnits allows negative values, so we handle this in validateAmount instead
    });
  });

  describe('fromWei', () => {
    it('should convert wei to USDC amount (6 decimals)', () => {
      expect(AmountConverter.fromWei('1500000', 6)).toBe('1.5');
      expect(AmountConverter.fromWei('100000', 6)).toBe('0.1');
      expect(AmountConverter.fromWei('1000123456', 6)).toBe('1000.123456');
    });

    it('should convert wei to ETH amount (18 decimals)', () => {
      expect(AmountConverter.fromWei('1000000000000000000', 18)).toBe('1.0');
      expect(AmountConverter.fromWei('500000000000000000', 18)).toBe('0.5');
      expect(AmountConverter.fromWei('1', 18)).toBe('0.000000000000000001');
    });
  });

  describe('validateDecimalPlaces', () => {
    it('should validate decimal places for USDC (6 decimals)', () => {
      expect(AmountConverter.validateDecimalPlaces('1.123456', 6)).toBe(true);
      expect(AmountConverter.validateDecimalPlaces('1.1234567', 6)).toBe(false);
      expect(AmountConverter.validateDecimalPlaces('1', 6)).toBe(true);
    });

    it('should validate decimal places for ETH (18 decimals)', () => {
      expect(
        AmountConverter.validateDecimalPlaces('1.123456789012345678', 18)
      ).toBe(true);
      expect(
        AmountConverter.validateDecimalPlaces('1.1234567890123456789', 18)
      ).toBe(false);
      expect(AmountConverter.validateDecimalPlaces('1.5', 18)).toBe(true);
    });

    it('should handle amounts without decimal point', () => {
      expect(AmountConverter.validateDecimalPlaces('100', 6)).toBe(true);
      expect(AmountConverter.validateDecimalPlaces('1000', 18)).toBe(true);
    });
  });

  describe('validateAmount', () => {
    it('should validate USDC amounts (6 decimals)', () => {
      const result1 = AmountConverter.validateAmount('1.123456', 6);
      expect(result1.valid).toBe(true);
      expect(result1.error).toBeUndefined();

      const result2 = AmountConverter.validateAmount('1.1234567', 6);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('too many decimal places');
    });

    it('should validate ETH amounts (18 decimals)', () => {
      const result1 = AmountConverter.validateAmount(
        '0.000000000000000001',
        18
      );
      expect(result1.valid).toBe(true);

      const result2 = AmountConverter.validateAmount(
        '0.0000000000000000001',
        18
      );
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('too many decimal places');
    });

    it('should reject invalid formats', () => {
      const result1 = AmountConverter.validateAmount('abc', 6);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Invalid amount format');

      const result2 = AmountConverter.validateAmount('-1', 6);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Invalid amount format');

      const result3 = AmountConverter.validateAmount('0', 6);
      expect(result3.valid).toBe(false);
      expect(result3.error).toContain('greater than 0');
    });

    it('should handle edge cases', () => {
      const result1 = AmountConverter.validateAmount('.5', 6);
      expect(result1.valid).toBe(true);

      const result2 = AmountConverter.validateAmount('1.', 6);
      expect(result2.valid).toBe(false);
    });
  });

  describe('integration with ethers', () => {
    it('should produce same results as ethers.parseUnits', () => {
      const amounts = ['1.5', '0.1', '1000.123456'];
      const decimals = [6, 18];

      amounts.forEach(amount => {
        decimals.forEach(decimal => {
          const converterResult = AmountConverter.toWei(amount, decimal);
          const ethersResult = parseUnits(amount, decimal).toString();
          expect(converterResult).toBe(ethersResult);
        });
      });
    });
  });
});
