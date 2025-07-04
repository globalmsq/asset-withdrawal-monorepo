// Import Prisma client from root node_modules
const { PrismaClient } = require('../../../node_modules/@prisma/client');

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