import { LoggerService } from '@asset-withdrawal/shared';

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
      this.logger.info('DATABASE_URL set for Prisma connection');
    }

    // Dynamically import PrismaClient after setting DATABASE_URL
    try {
      const { PrismaClient } = require('@prisma/client');
      this.prisma = new PrismaClient();
      this.logger.info('PrismaClient initialized successfully');
    } catch (error: any) {
      this.logger.error('Failed to load PrismaClient:', {
        error: error?.message || error,
        stack: error?.stack,
        cwd: process.cwd(),
        nodeModulesPath: require.resolve.paths('@prisma/client'),
      });
      throw new Error(
        'Prisma client not found. Please run "pnpm install" and "pnpm run db:generate" to set up the database client.'
      );
    }
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
    } catch (error: any) {
      this.logger.error('Database health check failed:', {
        error: error,
        message: error?.message,
        stack: error?.stack,
        databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not set',
      });
      return false;
    }
  }
}
