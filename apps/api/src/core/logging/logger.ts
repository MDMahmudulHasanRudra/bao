import pino from 'pino';
import { loadEnv } from '../config/env.js';

let _logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (_logger) return _logger;
  const env = loadEnv();
  _logger = pino({
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV !== 'production' && env.LOG_FORMAT === 'pretty'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
  return _logger;
}

export function createChildLogger(name: string, extra?: Record<string, unknown>): pino.Logger {
  return getLogger().child({ module: name, ...extra });
}
