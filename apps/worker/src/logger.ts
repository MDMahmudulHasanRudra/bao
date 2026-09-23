import pino from 'pino';
import { loadEnv } from '@bao/config';

const env = loadEnv();

export function getLogger(name?: string) {
  return pino({
    name,
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV !== 'production' && env.LOG_FORMAT === 'pretty'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}
