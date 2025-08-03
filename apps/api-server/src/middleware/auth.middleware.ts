import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { AuthTokenPayload, UserRole } from '@asset-withdrawal/shared';

export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing',
        code: 'AUTH_HEADER_MISSING',
        timestamp: new Date(),
      });
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization format',
        code: 'INVALID_AUTH_FORMAT',
        timestamp: new Date(),
      });
    }

    const decoded = authService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
      timestamp: new Date(),
    });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
        timestamp: new Date(),
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        timestamp: new Date(),
      });
    }

    next();
  };
};
