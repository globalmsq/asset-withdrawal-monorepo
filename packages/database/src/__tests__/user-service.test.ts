import { UserService } from '../user-service';
import { DatabaseService } from '../database';
import { User } from '@prisma/client';

jest.mock('../database');

describe('UserService', () => {
  let userService: UserService;
  let mockPrismaClient: any;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Prisma client
    mockPrismaClient = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    // Mock DatabaseService
    mockDatabaseService = {
      getClient: jest.fn().mockReturnValue(mockPrismaClient),
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(
      mockDatabaseService
    );

    userService = new UserService();
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'USER',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      };

      const createdUser: User = {
        id: 'user123',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.user.create.mockResolvedValue(createdUser);

      const result = await userService.createUser(userData);

      expect(mockPrismaClient.user.create).toHaveBeenCalledWith({
        data: userData,
      });
      expect(result).toEqual(createdUser);
    });

    it('should create user without wallet', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword',
      };

      const createdUser: User = {
        id: 'user123',
        email: userData.email,
        password: userData.password,
        role: 'USER',
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.user.create.mockResolvedValue(createdUser);

      const result = await userService.createUser(userData);

      expect(mockPrismaClient.user.create).toHaveBeenCalledWith({
        data: userData,
      });
      expect(result).toEqual(createdUser);
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const email = 'test@example.com';
      const user: User = {
        id: 'user123',
        email,
        password: 'hashedPassword',
        role: 'USER',
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.user.findUnique.mockResolvedValue(user);

      const result = await userService.findByEmail(email);

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      const email = 'nonexistent@example.com';

      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const result = await userService.findByEmail(email);

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const id = 'user123';
      const user: User = {
        id,
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'USER',
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.user.findUnique.mockResolvedValue(user);

      const result = await userService.findById(id);

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      const id = 'nonexistent';

      mockPrismaClient.user.findUnique.mockResolvedValue(null);

      const result = await userService.findById(id);

      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { id },
      });
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user data', async () => {
      const id = 'user123';
      const updateData = {
        email: 'newemail@example.com',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      };

      const updatedUser: User = {
        id,
        email: updateData.email,
        password: 'hashedPassword',
        role: 'USER',
        wallet: updateData.wallet,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.user.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUser(id, updateData);

      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id },
        data: updateData,
      });
      expect(result).toEqual(updatedUser);
    });
  });

  describe('deleteUser', () => {
    it('should delete a user', async () => {
      const id = 'user123';
      const deletedUser: User = {
        id,
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'USER',
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.user.delete.mockResolvedValue(deletedUser);

      const result = await userService.deleteUser(id);

      expect(mockPrismaClient.user.delete).toHaveBeenCalledWith({
        where: { id },
      });
      expect(result).toEqual(deletedUser);
    });
  });

  describe('findMany', () => {
    it('should find users with pagination', async () => {
      const users: User[] = [
        {
          id: 'user1',
          email: 'user1@example.com',
          password: 'hashedPassword',
          role: 'USER',
          wallet: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'user2',
          email: 'user2@example.com',
          password: 'hashedPassword',
          role: 'ADMIN',
          wallet: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaClient.user.findMany.mockResolvedValue(users);

      const result = await userService.findMany({
        skip: 0,
        take: 10,
      });

      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
      });
      expect(result).toEqual(users);
    });

    it('should find users with role filter', async () => {
      const adminUsers: User[] = [
        {
          id: 'admin1',
          email: 'admin@example.com',
          password: 'hashedPassword',
          role: 'ADMIN',
          wallet: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaClient.user.findMany.mockResolvedValue(adminUsers);

      const result = await userService.findMany({
        where: { role: 'ADMIN' },
      });

      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
      });
      expect(result).toEqual(adminUsers);
    });

    it('should find all users when no params provided', async () => {
      const allUsers: User[] = [];

      mockPrismaClient.user.findMany.mockResolvedValue(allUsers);

      const result = await userService.findMany();

      expect(mockPrismaClient.user.findMany).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(allUsers);
    });
  });
});
