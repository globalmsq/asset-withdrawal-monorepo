import { LoggerService } from '@asset-withdrawal/shared';

// Import PrismaClient
let PrismaClient: any;
try {
  // Try to import from root node_modules first
  PrismaClient = require('../../../node_modules/@prisma/client').PrismaClient;
} catch (error) {
  try {
    // Fallback to regular import
    PrismaClient = require('@prisma/client').PrismaClient;
  } catch (error2) {
    throw new Error(
      'Prisma client not found. Please run "yarn install" and "prisma generate" to set up the database client.'
    );
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
  private static instance: DatabaseService;
  private prisma: any;
  private logger: LoggerService;

  constructor(config?: DatabaseConfig) {
    this.logger = new LoggerService({ service: 'database' });

    if (config) {
      // Set DATABASE_URL environment variable for Prisma
      const databaseUrl = `mysql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
      process.env.DATABASE_URL = databaseUrl;
    }
    // Always create PrismaClient after setting DATABASE_URL
    this.prisma = new PrismaClient();
  }

  public static getInstance(config?: DatabaseConfig): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(config);
    }
    return DatabaseService.instance;
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
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }
}
