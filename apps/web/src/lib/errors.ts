import { ApiError } from './api';

export function errMsg(e: unknown): string {
  if (typeof e === 'string') return e;
  return e instanceof Error ? e.message : 'Request failed';
}

// 403 by status when we have it; the message match is the fallback for
// non-ApiError throws and for the pages that predate ApiError.status.
export function isPermissionError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 403;
  return e instanceof Error && /Missing permission|Forbidden/i.test(e.message);
}

// Spec 6: failures show a support correlation ID when the API sent one, so a
// user can quote the id. Never render the key, payload, or URL alongside it.
export function withCorrelation(e: unknown): string {
  const msg = errMsg(e);
  const id = e instanceof ApiError ? e.correlationId : undefined;
  return id ? `${msg} (ref: ${id})` : msg;
}
