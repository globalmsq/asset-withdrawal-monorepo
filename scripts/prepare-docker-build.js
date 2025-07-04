#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create docker-build directory
const buildDir = path.join(__dirname, '..', 'docker-build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Copy package.json and modify it
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const apiServerPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'api-server', 'package.json'), 'utf8'));

// Replace workspace dependencies with file paths
if (apiServerPackageJson.dependencies) {
  Object.keys(apiServerPackageJson.dependencies).forEach(dep => {
    if (apiServerPackageJson.dependencies[dep] === 'workspace:*') {
      delete apiServerPackageJson.dependencies[dep];
    }
  });
}

// Add necessary dependencies
apiServerPackageJson.dependencies = {
  ...apiServerPackageJson.dependencies,
  '@prisma/client': '^5.7.0',
  'express': '^4.18.2',
  'cors': '^2.8.5',
  'helmet': '^7.0.0',
  'morgan': '^1.10.0',
  'swagger-jsdoc': '^6.2.8',
  'swagger-ui-express': '^5.0.1'
};

// Write the modified package.json
fs.writeFileSync(path.join(buildDir, 'package.json'), JSON.stringify(apiServerPackageJson, null, 2));

// Copy source files
const srcDir = path.join(buildDir, 'src');
fs.mkdirSync(srcDir, { recursive: true });

// Copy all TypeScript files and compile them inline
const copyAndTransform = (src, dest) => {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(file => {
      copyAndTransform(path.join(src, file), path.join(dest, file));
    });
  } else if (src.endsWith('.ts') && !src.endsWith('.test.ts') && !src.endsWith('.spec.ts')) {
    let content = fs.readFileSync(src, 'utf8');
    
    // Replace imports
    content = content.replace(/from ['"]shared['"]/g, "from './shared'");
    content = content.replace(/from ['"]database['"]/g, "from './database'");
    content = content.replace(/import .* from ['"]shared['"]/g, "import { WithdrawalRequest, WithdrawalResponse, TransactionStatus, ApiResponse, QueueManager, InMemoryQueue } from './shared'");
    content = content.replace(/import .* from ['"]database['"]/g, "import { DatabaseService, DatabaseConfig, TransactionService } from './database'");
    
    fs.writeFileSync(dest.replace('.ts', '.js'), content);
  }
};

// Copy api-server source
copyAndTransform(
  path.join(__dirname, '..', 'apps', 'api-server', 'src'),
  srcDir
);

// Copy shared types and queue as a single file
const sharedContent = `
// Shared types and utilities
export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: string;
  toAddress: string;
  tokenAddress: string;
  network: string;
  createdAt: Date;
}

export interface WithdrawalResponse {
  id: string;
  status: TransactionStatus;
  transactionHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface QueueMessage<T = any> {
  id: string;
  data: T;
  timestamp: Date;
  retryCount: number;
}

export class InMemoryQueue<T = any> {
  private queue: QueueMessage<T>[] = [];
  private processingQueue: QueueMessage<T>[] = [];
  private maxRetries = 3;

  constructor(private name: string) {}

  async enqueue(data: T): Promise<string> {
    const message: QueueMessage<T> = {
      id: this.generateId(),
      data,
      timestamp: new Date(),
      retryCount: 0
    };
    this.queue.push(message);
    return message.id;
  }

  async dequeue(): Promise<QueueMessage<T> | null> {
    const message = this.queue.shift();
    if (message) {
      this.processingQueue.push(message);
    }
    return message || null;
  }

  async ack(messageId: string): Promise<boolean> {
    const index = this.processingQueue.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      this.processingQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  async nack(messageId: string): Promise<boolean> {
    const index = this.processingQueue.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      const message = this.processingQueue[index];
      this.processingQueue.splice(index, 1);
      if (message.retryCount < this.maxRetries) {
        message.retryCount++;
        this.queue.push(message);
        return true;
      }
    }
    return false;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getProcessingSize(): number {
    return this.processingQueue.length;
  }

  private generateId(): string {
    return \`\${this.name}-\${Date.now()}-\${Math.random().toString(36).substring(2, 11)}\`;
  }
}

export class QueueManager {
  private queues: Map<string, InMemoryQueue> = new Map();

  getQueue<T = any>(name: string): InMemoryQueue<T> {
    if (!this.queues.has(name)) {
      this.queues.set(name, new InMemoryQueue<T>(name));
    }
    return this.queues.get(name) as InMemoryQueue<T>;
  }

  getAllQueues(): Map<string, InMemoryQueue> {
    return this.queues;
  }
}

export const queueManager = new QueueManager();
`;

fs.writeFileSync(path.join(srcDir, 'shared.js'), sharedContent);

// Copy database module as a single file
const databaseContent = `
// Database module
const { PrismaClient } = require('@prisma/client');

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class DatabaseService {
  private prisma: PrismaClient;

  constructor(config: DatabaseConfig) {
    const databaseUrl = \`mysql://\${config.user}:\${config.password}@\${config.host}:\${config.port}/\${config.database}\`;
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  public getClient(): PrismaClient {
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
      await this.prisma.$queryRaw\`SELECT 1\`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

export class TransactionService {
  private prisma: PrismaClient;

  constructor(dbService: DatabaseService) {
    this.prisma = dbService.getClient();
  }

  async createTransaction(data: {
    userId: string;
    amount: number;
    currency: string;
    status: string;
  }) {
    return await this.prisma.transaction.create({
      data: {
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
      },
    });
  }

  async getTransactionById(id: string) {
    return await this.prisma.transaction.findUnique({
      where: { id },
    });
  }

  async updateTransaction(id: string, data: any) {
    return await this.prisma.transaction.update({
      where: { id },
      data,
    });
  }
}
`;

fs.writeFileSync(path.join(srcDir, 'database.js'), databaseContent);

// Copy Prisma schema
fs.mkdirSync(path.join(buildDir, 'prisma'), { recursive: true });
fs.copyFileSync(
  path.join(__dirname, '..', 'prisma', 'schema.prisma'),
  path.join(buildDir, 'prisma', 'schema.prisma')
);

console.log('Docker build directory prepared at:', buildDir);