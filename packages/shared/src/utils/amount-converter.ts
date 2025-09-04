import { parseUnits, formatUnits } from 'ethers';

export class AmountConverter {
  /**
   * Convert decimal amount string to wei string using token decimals
   * @param amount Decimal amount string (e.g., "1.5", "0.001")
   * @param decimals Token decimals (e.g., 6 for USDC, 18 for ETH)
   * @returns Wei amount as string
   */
  static toWei(amount: string, decimals: number): string {
    try {
      const parsedAmount = parseUnits(amount, decimals);
      return parsedAmount.toString();
    } catch (error) {
      throw new Error(
        `Failed to convert amount to wei: ${amount} with ${decimals} decimals`
      );
    }
  }

  /**
   * Convert wei string to decimal amount using token decimals
   * @param weiAmount Wei amount as string
   * @param decimals Token decimals (e.g., 6 for USDC, 18 for ETH)
   * @returns Decimal amount as string
   */
  static fromWei(weiAmount: string, decimals: number): string {
    try {
      return formatUnits(weiAmount, decimals);
    } catch (error) {
      throw new Error(
        `Failed to convert wei to amount: ${weiAmount} with ${decimals} decimals`
      );
    }
  }

  /**
   * Validate that decimal places don't exceed token decimals
   * @param amount Decimal amount string
   * @param maxDecimals Maximum allowed decimal places
   * @returns true if valid, false if too many decimal places
   */
  static validateDecimalPlaces(amount: string, maxDecimals: number): boolean {
    const decimalIndex = amount.indexOf('.');

    if (decimalIndex === -1) {
      // No decimal point, always valid
      return true;
    }

    const decimalPlaces = amount.length - decimalIndex - 1;
    return decimalPlaces <= maxDecimals;
  }

  /**
   * Validate amount format and decimal places for a specific token
   * @param amount Amount string to validate
   * @param decimals Token decimals
   * @returns Validation result with error message if invalid
   */
  static validateAmount(
    amount: string,
    decimals: number
  ): { valid: boolean; error?: string } {
    // Basic format validation
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(amount)) {
      return {
        valid: false,
        error: 'Invalid amount format. Must be a positive number',
      };
    }

    // Check if amount is positive
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return {
        valid: false,
        error: 'Amount must be greater than 0',
      };
    }

    // Check decimal places
    if (!this.validateDecimalPlaces(amount, decimals)) {
      return {
        valid: false,
        error: `Amount has too many decimal places. Maximum ${decimals} decimals allowed for this token`,
      };
    }

    // Try conversion to ensure no overflow
    try {
      parseUnits(amount, decimals);
    } catch (error) {
      return {
        valid: false,
        error: 'Amount is too large or has invalid format',
      };
    }

    return { valid: true };
  }
}

export const { toWei, fromWei, validateDecimalPlaces, validateAmount } =
  AmountConverter;
