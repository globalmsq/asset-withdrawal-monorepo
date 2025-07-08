import { Request, Response, NextFunction } from 'express';
import { authenticate, authorize, AuthRequest } from '../auth.middleware';
import { authService } from '../../services/auth.service';
import { AuthTokenPayload, UserRole } from 'shared';

jest.mock('../../services/auth.service');

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should call next() with valid token', () => {
      const mockToken = 'validToken';
      const mockPayload: AuthTokenPayload = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.USER,
      };

      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      (authService.verifyToken as jest.Mock).mockReturnValue(mockPayload);

      authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(authService.verifyToken).toHaveBeenCalledWith(mockToken);
      expect(mockRequest.user).toEqual(mockPayload);
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is missing', () => {
      authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization header missing',
        code: 'AUTH_HEADER_MISSING',
        timestamp: expect.any(Date),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization format is invalid', () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token',
      };

      authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid authorization format',
        code: 'INVALID_AUTH_FORMAT',
        timestamp: expect.any(Date),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when token is missing after Bearer', () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid authorization format',
        code: 'INVALID_AUTH_FORMAT',
        timestamp: expect.any(Date),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 when token verification fails', () => {
      const mockToken = 'invalidToken';
      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      (authService.verifyToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      authenticate(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
        timestamp: expect.any(Date),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('should call next() when user has required role', () => {
      mockRequest.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.ADMIN,
      };

      const middleware = authorize(UserRole.ADMIN, UserRole.USER);
      middleware(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      const middleware = authorize(UserRole.ADMIN);
      middleware(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        timestamp: expect.any(Date),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks required role', () => {
      mockRequest.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.USER,
      };

      const middleware = authorize(UserRole.ADMIN);
      middleware(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        timestamp: expect.any(Date),
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should work with multiple allowed roles', () => {
      mockRequest.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: UserRole.USER,
      };

      const middleware = authorize(UserRole.ADMIN, UserRole.USER);
      middleware(
        mockRequest as AuthRequest,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });
});
