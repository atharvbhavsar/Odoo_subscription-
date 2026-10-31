import session from 'express-session';
import { env } from './env';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      role: 'admin' | 'staff' | 'customer';
      customerId?: string;
      name?: string;
    };
  }
}

export const sessionMiddleware = session({
  name: 'brightloop.sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

