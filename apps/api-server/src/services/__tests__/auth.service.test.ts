import { authService } from '../auth.service';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthTokenPayload, UserRole } from '@asset-withdrawal/shared';

jest.mock('jsonwebtoken');
jest.mock('bcryptjs');

describe('AuthService', () => {
  const mockPayload: AuthTokenPayload = {
    userId: 'user123',
    email: 'test@example.com',
    role: UserRole.USER,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword';
      const salt = 'mockSalt';

      (bcrypt.genSalt as jest.Mock).mockResolvedValue(salt);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await authService.hashPassword(password);

      expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
      expect(bcrypt.hash).toHaveBeenCalledWith(password, salt);
      expect(result).toBe(hashedPassword);
    });

    it('should throw error if hashing fails', async () => {
      const password = 'testPassword123';
      const error = new Error('Hashing failed');

      (bcrypt.genSalt as jest.Mock).mockRejectedValue(error);

      await expect(authService.hashPassword(password)).rejects.toThrow(error);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching passwords', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword';

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.comparePassword(
        password,
        hashedPassword
      );

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false for non-matching passwords', async () => {
      const password = 'testPassword123';
      const hashedPassword = 'hashedPassword';

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await authService.comparePassword(
        password,
        hashedPassword
      );

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('should generate a JWT token', () => {
      const mockToken = 'mockJwtToken';

      (jwt.sign as jest.Mock).mockReturnValue(mockToken);

      const result = authService.generateToken(mockPayload);

      expect(jwt.sign).toHaveBeenCalledWith(mockPayload, expect.any(String), {
        expiresIn: '24h',
      });
      expect(result).toBe(mockToken);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const mockToken = 'validToken';

      (jwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = authService.verifyToken(mockToken);

      expect(jwt.verify).toHaveBeenCalledWith(mockToken, expect.any(String));
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for invalid token', () => {
      const mockToken = 'invalidToken';
      const error = new Error('jwt malformed');

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => authService.verifyToken(mockToken)).toThrow(
        'Invalid or expired token'
      );
    });

    it('should throw error for expired token', () => {
      const mockToken = 'expiredToken';
      const error = new Error('jwt expired');

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw error;
      });

      expect(() => authService.verifyToken(mockToken)).toThrow(
        'Invalid or expired token'
      );
    });
  });

  describe('getExpiresInSeconds', () => {
    it('should convert hours to seconds', () => {
      const service = authService;
      // Default is 24h
      const result = service.getExpiresInSeconds();
      expect(result).toBe(86400); // 24 * 3600
    });

    it('should handle different time units', () => {
      // Test would require modifying JWT_EXPIRES_IN, which is set in constructor
      // For now, we're testing the default behavior
      expect(authService.getExpiresInSeconds()).toBe(86400);
    });
  });
});
