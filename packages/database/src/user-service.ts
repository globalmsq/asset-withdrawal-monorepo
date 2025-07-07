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

  async findById(id: string): Promise<User | null> {
    return this.db.getClient().user.findUnique({
      where: { id },
    });
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.db.getClient().user.update({
      where: { id },
      data,
    });
  }

  async deleteUser(id: string): Promise<User> {
    return this.db.getClient().user.delete({
      where: { id },
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
