import { Request, Response, NextFunction } from 'express';

export function requireRole(allowedRoles: Array<'admin' | 'staff' | 'customer'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`,
        },
      });
    }

    next();
  };
}

export function enforceCustomerOwnership(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  // Admin and Staff can view any customer's records
  if (req.user.role === 'admin' || req.user.role === 'staff') {
    return next();
  }

  // Customer role must match customerId
  const requestedCustomerId = req.params.customerId || req.query.customerId || req.body.customerId;
  if (requestedCustomerId && req.user.customerId !== requestedCustomerId) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You can only access your own customer records',
      },
    });
  }

  next();
}

