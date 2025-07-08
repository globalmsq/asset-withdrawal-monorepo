import { DatabaseService } from './database';
import type { User } from '@prisma/client';

export class UserService {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  async createUser(data: {
    email: string;
    password: string;
    role?: string;
    wallet?: string;
  }): Promise<User> {
    return this.db.getClient().user.create({
      data,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.db.getClient().user.findUnique({
      where: { email },
    });
  }

  async findById(id: string | bigint): Promise<User | null> {
    const numericId = typeof id === 'string' ? BigInt(id) : id;
    return this.db.getClient().user.findUnique({
      where: { id: numericId },
    });
  }

  async updateUser(id: string | bigint, data: Partial<User>): Promise<User> {
    const numericId = typeof id === 'string' ? BigInt(id) : id;
    return this.db.getClient().user.update({
      where: { id: numericId },
      data,
    });
  }

  async deleteUser(id: string | bigint): Promise<User> {
    const numericId = typeof id === 'string' ? BigInt(id) : id;
    return this.db.getClient().user.delete({
      where: { id: numericId },
    });
  }

  async findMany(params?: {
    skip?: number;
    take?: number;
    where?: {
      role?: string;
    };
  }): Promise<User[]> {
    return this.db.getClient().user.findMany(params);
  }
}
