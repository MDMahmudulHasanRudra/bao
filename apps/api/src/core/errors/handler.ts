import type { Context } from 'hono';
import { AppError } from './http.js';
import { createChildLogger } from '../logging/logger.js';
import { getCorrelationId } from '../logging/correlation.js';

const log = createChildLogger('error-handler');

export function errorHandler(err: Error, c: Context) {
  const correlationId = getCorrelationId(c);

  if (err instanceof AppError) {
    log.warn({ err, correlationId, code: err.code }, err.message);
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details, correlationId } },
      err.statusCode as 400,
    );
  }

  log.error({ err, correlationId }, 'Unhandled error');
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error', correlationId } },
    500,
  );
}
