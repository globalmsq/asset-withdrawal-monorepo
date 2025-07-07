import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { AuthTokenPayload, UserRole } from 'shared';

export class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_EXPIRES_IN: string;

  constructor() {
    this.JWT_SECRET =
      process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async comparePassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  generateToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload as any, this.JWT_SECRET as jwt.Secret, {
      expiresIn: this.JWT_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, this.JWT_SECRET) as AuthTokenPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  getExpiresInSeconds(): number {
    const time = this.JWT_EXPIRES_IN;
    const unit = time.slice(-1);
    const value = parseInt(time.slice(0, -1));

    switch (unit) {
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      case 'm':
        return value * 60;
      case 's':
        return value;
      default:
        return 86400; // Default to 24 hours
    }
  }
}

export const authService = new AuthService();
