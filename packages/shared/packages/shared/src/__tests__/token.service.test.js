"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const token_service_1 = require("../services/token.service");
describe('TokenService', () => {
    let tokenService;
    beforeEach(() => {
        tokenService = token_service_1.TokenService.getInstance();
    });
    describe('getInstance', () => {
        it('should return the same instance', () => {
            const instance1 = token_service_1.TokenService.getInstance();
            const instance2 = token_service_1.TokenService.getInstance();
            expect(instance1).toBe(instance2);
        });
    });
    describe('getTokenByAddress', () => {
        it('should return token info for valid mainnet token', () => {
            const token = tokenService.getTokenByAddress('0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'mainnet');
            expect(token).toBeDefined();
            expect(token?.symbol).toBe('USDT');
            expect(token?.decimals).toBe(6);
            expect(token?.network).toBe('mainnet');
            expect(token?.chainId).toBe(137);
        });
        it('should return token info for valid testnet token', () => {
            const token = tokenService.getTokenByAddress('0xfF1d6E9cb940a3D2c596C2B0d670fA72d1f049Cc', 'testnet');
            expect(token).toBeDefined();
            expect(token?.symbol).toBe('USDT');
            expect(token?.decimals).toBe(6);
            expect(token?.network).toBe('testnet');
            expect(token?.chainId).toBe(80002);
        });
        it('should handle case-insensitive addresses', () => {
            const token = tokenService.getTokenByAddress('0xC2132D05D31C914A87C6611C10748AEB04B58E8F', // uppercase
            'mainnet');
            expect(token).toBeDefined();
            expect(token?.symbol).toBe('USDT');
        });
        it('should return null for invalid token address', () => {
            const token = tokenService.getTokenByAddress('0x0000000000000000000000000000000000000001', 'mainnet');
            expect(token).toBeNull();
        });
        it('should return null for invalid network', () => {
            const token = tokenService.getTokenByAddress('0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'invalid-network');
            expect(token).toBeNull();
        });
    });
    describe('getTokenBySymbol', () => {
        it('should return token info for valid symbol on mainnet', () => {
            const token = tokenService.getTokenBySymbol('USDT', 'mainnet');
            expect(token).toBeDefined();
            expect(token?.address).toBe('0xc2132D05D31c914a87C6611C10748AEb04B58e8F');
            expect(token?.decimals).toBe(6);
            expect(token?.network).toBe('mainnet');
            expect(token?.chainId).toBe(137);
        });
        it('should return token info for valid symbol on testnet', () => {
            const token = tokenService.getTokenBySymbol('KWT', 'testnet');
            expect(token).toBeDefined();
            expect(token?.address).toBe('0x8Ec17bf427556c3972540aAc01adb6367E32d5D3');
            expect(token?.decimals).toBe(6);
        });
        it('should return null for invalid symbol', () => {
            const token = tokenService.getTokenBySymbol('INVALID', 'mainnet');
            expect(token).toBeNull();
        });
        it('should return null for invalid network', () => {
            const token = tokenService.getTokenBySymbol('USDT', 'invalid-network');
            expect(token).toBeNull();
        });
    });
    describe('isTokenSupported', () => {
        it('should return true for supported token', () => {
            const isSupported = tokenService.isTokenSupported('0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'mainnet');
            expect(isSupported).toBe(true);
        });
        it('should return false for unsupported token', () => {
            const isSupported = tokenService.isTokenSupported('0x0000000000000000000000000000000000000001', 'mainnet');
            expect(isSupported).toBe(false);
        });
        it('should handle case-insensitive addresses', () => {
            const isSupported = tokenService.isTokenSupported('0xC2132D05D31C914A87C6611C10748AEB04B58E8F', 'mainnet');
            expect(isSupported).toBe(true);
        });
    });
    describe('getSupportedTokens', () => {
        it('should return all mainnet tokens', () => {
            const tokens = tokenService.getSupportedTokens('mainnet');
            expect(tokens).toHaveLength(5);
            expect(tokens.map(t => t.symbol)).toContain('USDT');
            expect(tokens.map(t => t.symbol)).toContain('MSQ');
            expect(tokens.map(t => t.symbol)).toContain('SUT');
            expect(tokens.map(t => t.symbol)).toContain('KWT');
            expect(tokens.map(t => t.symbol)).toContain('P2UC');
        });
        it('should return all testnet tokens', () => {
            const tokens = tokenService.getSupportedTokens('testnet');
            expect(tokens).toHaveLength(5);
            expect(tokens.map(t => t.symbol)).toContain('USDT');
            expect(tokens.map(t => t.symbol)).toContain('MSQ');
            expect(tokens.map(t => t.symbol)).toContain('SUT');
            expect(tokens.map(t => t.symbol)).toContain('KWT');
            expect(tokens.map(t => t.symbol)).toContain('P2UC');
        });
        it('should return empty array for invalid network', () => {
            const tokens = tokenService.getSupportedTokens('invalid-network');
            expect(tokens).toEqual([]);
        });
    });
    describe('getSupportedNetworks', () => {
        it('should return all supported networks', () => {
            const networks = tokenService.getSupportedNetworks();
            expect(networks).toHaveLength(2);
            expect(networks).toContain('mainnet');
            expect(networks).toContain('testnet');
        });
    });
    describe('getSupportedBlockchains', () => {
        it('should get all supported blockchains', () => {
            const blockchains = tokenService.getSupportedBlockchains();
            expect(blockchains).toHaveLength(3);
            expect(blockchains).toContain('polygon');
            expect(blockchains).toContain('bsc');
            expect(blockchains).toContain('localhost');
        });
    });
});
//# sourceMappingURL=token.service.test.js.map