"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainProviderFactory = void 0;
const chain_provider_1 = require("./chain.provider");
class ChainProviderFactory {
    static providers = new Map();
    static getProvider(chain, network, rpcUrl) {
        const key = `${chain}-${network}${rpcUrl ? `-${rpcUrl}` : ''}`;
        if (!this.providers.has(key)) {
            const provider = new chain_provider_1.ChainProvider({ chain, network, rpcUrl });
            this.providers.set(key, provider);
        }
        return this.providers.get(key);
    }
    static clearProviders() {
        this.providers.clear();
    }
}
exports.ChainProviderFactory = ChainProviderFactory;
//# sourceMappingURL=chain-provider.factory.js.map