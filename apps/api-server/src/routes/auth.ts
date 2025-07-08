import { Router, Request, Response } from 'express';
import { UserService } from 'database';
import { authService } from '../services/auth.service';
import { LoginRequest, UserRole, ApiResponse, LoginResponse } from 'shared';
import { AuthRequest, authenticate } from '../middleware/auth.middleware';

const router = Router();
const userService = new UserService();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, wallet } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date(),
      } as ApiResponse);
    }

    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        code: 'USER_EXISTS',
        timestamp: new Date(),
      } as ApiResponse);
    }

    const hashedPassword = await authService.hashPassword(password);
    const user = await userService.createUser({
      email,
      password: hashedPassword,
      role: UserRole.USER,
      wallet,
    });

    const token = authService.generateToken({
      userId: user.id.toString(),
      email: user.email,
      role: user.role as UserRole,
    });

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        token,
        user: {
          id: user.id.toString(),
          email: user.email,
          role: user.role as UserRole,
        },
        expiresIn: authService.getExpiresInSeconds(),
      },
      timestamp: new Date(),
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
      timestamp: new Date(),
    } as ApiResponse);
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date(),
      } as ApiResponse);
    }

    const user = await userService.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        timestamp: new Date(),
      } as ApiResponse);
    }

    const isPasswordValid = await authService.comparePassword(
      password,
      user.password
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        timestamp: new Date(),
      } as ApiResponse);
    }

    const token = authService.generateToken({
      userId: user.id.toString(),
      email: user.email,
      role: user.role as UserRole,
    });

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: {
        token,
        user: {
          id: user.id.toString(),
          email: user.email,
          role: user.role as UserRole,
        },
        expiresIn: authService.getExpiresInSeconds(),
      },
      timestamp: new Date(),
    };

    res.json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR',
      timestamp: new Date(),
    } as ApiResponse);
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
        code: 'NOT_AUTHENTICATED',
        timestamp: new Date(),
      } as ApiResponse);
    }

    const user = await userService.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        timestamp: new Date(),
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: {
        id: user.id.toString(),
        email: user.email,
        role: user.role,
        wallet: user.wallet,
        createdAt: user.createdAt,
      },
      timestamp: new Date(),
    } as ApiResponse);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
      code: 'GET_USER_ERROR',
      timestamp: new Date(),
    } as ApiResponse);
  }
});

export default router;
