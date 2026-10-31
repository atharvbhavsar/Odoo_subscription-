import crypto from 'crypto';
import { env } from '../config/env';
import { AuthenticatedUser } from '../middleware/auth.middleware';

export function generateToken(user: AuthenticatedUser): string {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
      name: user.name,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days expiration
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyToken(token: string): AuthenticatedUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', env.SESSION_SECRET)
      .update(payloadStr)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const data = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;

    return {
      id: data.id,
      email: data.email,
      role: data.role,
      customerId: data.customerId,
      name: data.name,
    };
  } catch {
    return null;
  }
}

