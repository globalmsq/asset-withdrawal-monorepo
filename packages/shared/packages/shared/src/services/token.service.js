"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenService = exports.TokenService = void 0;
const tslib_1 = require("tslib");
const tokens_config_json_1 = tslib_1.__importDefault(require("../config/tokens.config.json"));
const chains_config_json_1 = tslib_1.__importDefault(require("../config/chains.config.json"));
class TokenService {
    static instance;
    tokenConfig;
    constructor() {
        this.tokenConfig = tokens_config_json_1.default;
    }
    static getInstance() {
        if (!TokenService.instance) {
            TokenService.instance = new TokenService();
        }
        return TokenService.instance;
    }
    getTokenByAddress(address, network, chain = 'polygon') {
        const normalizedAddress = address.toLowerCase();
        const blockchainConfig = this.tokenConfig[chain];
        if (!blockchainConfig) {
            return null;
        }
        const networkConfig = blockchainConfig[network];
        if (!networkConfig) {
            return null;
        }
        for (const [symbol, token] of Object.entries(networkConfig)) {
            if (token.address.toLowerCase() === normalizedAddress) {
                return {
                    ...token,
                    network,
                    chainId: this.getChainId(chain, network),
                };
            }
        }
        return null;
    }
    getTokenBySymbol(symbol, network, chain = 'polygon') {
        const token = this.tokenConfig[chain]?.[network]?.[symbol];
        if (!token) {
            return null;
        }
        return {
            ...token,
            network,
            chainId: this.getChainId(chain, network),
        };
    }
    isTokenSupported(address, network, chain = 'polygon') {
        return this.getTokenByAddress(address, network, chain) !== null;
    }
    getSupportedTokens(network, chain = 'polygon') {
        const networkConfig = this.tokenConfig[chain]?.[network];
        if (!networkConfig) {
            return [];
        }
        return Object.values(networkConfig);
    }
    getSupportedNetworks(chain = 'polygon') {
        return Object.keys(this.tokenConfig[chain] || {});
    }
    getSupportedBlockchains() {
        return Object.keys(this.tokenConfig);
    }
    getChainId(blockchain, network) {
        return chains_config_json_1.default[blockchain]?.[network]?.chainId || 0;
    }
}
exports.TokenService = TokenService;
exports.tokenService = TokenService.getInstance();
//# sourceMappingURL=token.service.js.map