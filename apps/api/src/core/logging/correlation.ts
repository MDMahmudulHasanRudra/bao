import { nanoid } from 'nanoid';
import type { Context, Next } from 'hono';

const CORRELATION_HEADER = 'x-correlation-id';

export function correlationMiddleware() {
  return async (c: Context, next: Next) => {
    const id = c.req.header(CORRELATION_HEADER) || nanoid(21);
    c.set('correlationId', id);
    c.header(CORRELATION_HEADER, id);
    await next();
  };
}

export function getCorrelationId(c: Context): string {
  return (c.get('correlationId') as string) || 'unknown';
}
