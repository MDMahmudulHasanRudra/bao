import jwt from 'jsonwebtoken';
import type { Context, Next } from 'hono';
import { getEnv } from '../config/env.js';
import { UnauthorizedError } from '../errors/http.js';

export interface JwtPayload {
  sub: string;
  username: string;
  iat: number;
  exp: number;
}

export function signToken(payload: { sub: string; username: string }): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const env = getEnv();
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const header = c.req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing authorization header');

    const token = header.slice(7);
    try {
      const payload = verifyToken(token);
      c.set('userId', payload.sub);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    await next();
  };
}
