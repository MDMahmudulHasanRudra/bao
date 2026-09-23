import type { Context, Next } from 'hono';
import { createChildLogger } from '../logging/logger.js';
import { getCorrelationId } from '../logging/correlation.js';

const log = createChildLogger('http');

export function requestLogger() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const correlationId = getCorrelationId(c);

    await next();

    const ms = Date.now() - start;
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms,
        correlationId,
      },
      `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`,
    );
  };
}
