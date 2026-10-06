import { ApiError } from './client';
import { errorKey } from './errors';

type T = (key: string) => string;

/**
 * Turn any error into a translated message for the user.
 * `overrides` lets a screen give a better text for one status, for example 401 on the login form.
 */
export function errorMessage(t: T, error: unknown, overrides: Partial<Record<number, string>> = {}): string {
  if (error instanceof ApiError) {
    const custom = overrides[error.status];
    return custom ? t(custom) : t(errorKey(error.status));
  }
  return t('errors.generic');
}
