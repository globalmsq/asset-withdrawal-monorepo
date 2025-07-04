// Import from root node_modules
let PrismaClient: any;
try {
  // Try to import from root node_modules first
  PrismaClient = require('../../../node_modules/@prisma/client').PrismaClient;
} catch (error) {
  try {
    // Fallback to regular import
    PrismaClient = require('@prisma/client').PrismaClient;
  } catch (error2) {
    console.warn('Prisma client not found. Please run "prisma generate" if needed.');
    // Mock PrismaClient for development
    PrismaClient = class MockPrismaClient {
      $connect() { return Promise.resolve(); }
      $disconnect() { return Promise.resolve(); }
      $queryRaw() { return Promise.resolve([{ 1: 1 }]); }
    };
  }
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class DatabaseService {
  private prisma: any;

  constructor(config: DatabaseConfig) {
    const databaseUrl = `mysql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  public getClient(): any {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}