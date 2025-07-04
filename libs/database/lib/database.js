"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
// Import Prisma client from root node_modules
const { PrismaClient } = require('../../../node_modules/@prisma/client');
class DatabaseService {
    constructor(config) {
        const databaseUrl = `mysql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
        this.prisma = new PrismaClient({
            datasources: {
                db: {
                    url: databaseUrl,
                },
            },
        });
    }
    getClient() {
        return this.prisma;
    }
    async connect() {
        await this.prisma.$connect();
    }
    async disconnect() {
        await this.prisma.$disconnect();
    }
    async healthCheck() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return true;
        }
        catch (error) {
            console.error('Database health check failed:', error);
            return false;
        }
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=database.js.map