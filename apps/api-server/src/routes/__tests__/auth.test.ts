// Mock dependencies before imports
jest.mock('database', () => ({
  UserService: jest.fn(() => ({
    createUser: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    findMany: jest.fn(),
  })),
}));
jest.mock('../../services/auth.service');
jest.mock('../../middleware/auth.middleware', () => ({
  authenticate: jest.fn((req, res, next) => {
    // Default behavior - reject with 401
    return res.status(401).json({
      success: false,
      error: 'Authorization header missing',
      code: 'AUTH_HEADER_MISSING',
      timestamp: new Date(),
    });
  }),
  AuthRequest: {},
}));

import request from 'supertest';
import express from 'express';
import authRoutes from '../auth';
import { UserService } from 'database';
import { authService } from '../../services/auth.service';
import { UserRole } from 'shared';
import { authenticate } from '../../middleware/auth.middleware';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

// Store the mock instance created during module initialization
const mockUserServiceInstance = (UserService as jest.Mock).mock.results[0]
  ?.value;

describe('Auth Routes', () => {
  let mockUserService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use the stored mock instance
    mockUserService = mockUserServiceInstance;
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'password123',
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
      };

      const hashedPassword = 'hashedPassword';
      const createdUser = {
        id: 'user123',
        email: newUser.email,
        password: hashedPassword,
        role: UserRole.USER,
        wallet: newUser.wallet,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockToken = 'mockJwtToken';

      mockUserService.findByEmail.mockResolvedValue(null);
      (authService.hashPassword as jest.Mock).mockResolvedValue(hashedPassword);
      mockUserService.createUser.mockResolvedValue(createdUser);
      (authService.generateToken as jest.Mock).mockReturnValue(mockToken);
      (authService.getExpiresInSeconds as jest.Mock).mockReturnValue(86400);

      const response = await request(app)
        .post('/auth/register')
        .send(newUser)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          token: mockToken,
          user: {
            id: createdUser.id,
            email: createdUser.email,
            role: UserRole.USER,
          },
          expiresIn: 86400,
        },
        timestamp: expect.any(String),
      });

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(newUser.email);
      expect(authService.hashPassword).toHaveBeenCalledWith(newUser.password);
      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: newUser.email,
        password: hashedPassword,
        role: UserRole.USER,
        wallet: newUser.wallet,
      });
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ password: 'password123' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        timestamp: expect.any(String),
      });
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        timestamp: expect.any(String),
      });
    });

    it('should return 409 when user already exists', async () => {
      const existingUser = {
        id: 'existing123',
        email: 'existing@example.com',
        password: 'hashedPassword',
        role: UserRole.USER,
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserService.findByEmail.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        error: 'User already exists',
        code: 'USER_EXISTS',
        timestamp: expect.any(String),
      });
    });

    it('should handle registration errors', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);
      (authService.hashPassword as jest.Mock).mockRejectedValue(
        new Error('Hash error')
      );

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR',
        timestamp: expect.any(String),
      });
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const existingUser = {
        id: 'user123',
        email: loginData.email,
        password: 'hashedPassword',
        role: UserRole.USER,
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockToken = 'mockJwtToken';

      mockUserService.findByEmail.mockResolvedValue(existingUser);
      (authService.comparePassword as jest.Mock).mockResolvedValue(true);
      (authService.generateToken as jest.Mock).mockReturnValue(mockToken);
      (authService.getExpiresInSeconds as jest.Mock).mockReturnValue(86400);

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          token: mockToken,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            role: UserRole.USER,
          },
          expiresIn: 86400,
        },
        timestamp: expect.any(String),
      });

      expect(mockUserService.findByEmail).toHaveBeenCalledWith(loginData.email);
      expect(authService.comparePassword).toHaveBeenCalledWith(
        loginData.password,
        existingUser.password
      );
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ password: 'password123' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        timestamp: expect.any(String),
      });
    });

    it('should return 401 when user not found', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        timestamp: expect.any(String),
      });
    });

    it('should return 401 when password is incorrect', async () => {
      const existingUser = {
        id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: UserRole.USER,
        wallet: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserService.findByEmail.mockResolvedValue(existingUser);
      (authService.comparePassword as jest.Mock).mockResolvedValue(false);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        timestamp: expect.any(String),
      });
    });

    it('should handle login errors', async () => {
      mockUserService.findByEmail.mockRejectedValue(new Error('DB error'));

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Login failed',
        code: 'LOGIN_ERROR',
        timestamp: expect.any(String),
      });
    });
  });

  describe('GET /auth/me', () => {
    it('should return user info for authenticated user', async () => {
      const user = {
        id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: UserRole.USER,
        wallet: '0x742d35Cc6634C0532925a3b844Bc9e7595f7fAEd',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Configure authenticate middleware to pass through with user
      (authenticate as jest.Mock).mockImplementationOnce(
        (req: any, res, next) => {
          req.user = {
            userId: user.id,
            email: user.email,
            role: user.role,
          };
          next();
        }
      );

      mockUserService.findById.mockResolvedValue(user);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer mockToken')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          wallet: user.wallet,
          createdAt: user.createdAt.toISOString(),
        },
        timestamp: expect.any(String),
      });

      expect(mockUserService.findById).toHaveBeenCalledWith(user.id);
    });

    it('should return 404 when user not found', async () => {
      // Configure authenticate middleware to pass through with user
      (authenticate as jest.Mock).mockImplementationOnce(
        (req: any, res, next) => {
          req.user = {
            userId: 'nonexistent',
            email: 'test@example.com',
            role: UserRole.USER,
          };
          next();
        }
      );

      mockUserService.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer mockToken')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        timestamp: expect.any(String),
      });
    });
  });
});
