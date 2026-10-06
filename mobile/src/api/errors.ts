// No imports on purpose: the tests load this file with plain Node.

export type ErrorKey =
  | 'errors.network'
  | 'errors.unauthorized'
  | 'errors.conflict'
  | 'errors.validation'
  | 'errors.tooMany'
  | 'errors.timeout'
  | 'errors.serviceBusy'
  | 'errors.server'
  | 'errors.generic';

/**
 * Which translated message fits an HTTP status.
 * 0 = the server could not be reached. 408 = the app gave up waiting. -1 = the user cancelled (no message).
 */
export function errorKey(status: number): ErrorKey {
  if (status === 0) return 'errors.network';
  if (status === 401) return 'errors.unauthorized';
  if (status === 409) return 'errors.conflict';
  if (status === 422) return 'errors.validation';
  if (status === 429) return 'errors.tooMany';
  if (status === 504 || status === 408) return 'errors.timeout';
  if (status === 502 || status === 503) return 'errors.serviceBusy';
  if (status >= 500) return 'errors.server';
  return 'errors.generic';
}

/** Build a safe fallback text from a FastAPI error body. Only used for logs, never shown to users. */
export function detailText(body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === 'string') return first.msg;
  }
  return 'Something went wrong';
}
