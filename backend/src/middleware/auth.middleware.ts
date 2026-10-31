import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/token';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
  customerId?: string;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Check session cookie
  if (req.session && req.session.user) {
    req.user = req.session.user;
    return next();
  }

  // 2. Check Authorization Bearer token header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const verifiedUser = verifyToken(token);
    if (verifiedUser) {
      req.user = verifiedUser;
      if (req.session) {
        req.session.user = verifiedUser;
      }
      return next();
    }
  }

  return res.status(401).json({
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required to access this resource',
    },
  });
}
