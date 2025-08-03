export declare const ValidationPatterns: {
    BITCOIN_P2PKH: RegExp;
    BITCOIN_P2SH: RegExp;
    BITCOIN_BECH32: RegExp;
    ETHEREUM: RegExp;
    AMOUNT: RegExp;
};
export declare const SupportedNetworks: readonly ["ethereum", "bitcoin", "bsc", "polygon", "avalanche", "arbitrum", "optimism"];
export type NetworkType = (typeof SupportedNetworks)[number];
export declare function isValidAddress(address: string, network: string): boolean;
export declare function isValidAmount(amount: string): boolean;
export declare function isValidNetwork(network: string): network is NetworkType;
export interface FieldValidationError {
    field: string;
    message: string;
}
export declare function validateWithdrawalRequest(data: any): FieldValidationError[];
export declare function validateBatchWithdrawalRequest(data: any): FieldValidationError[];
