import viErrors from './locales/vi/errors.json';
import { classifyError } from '../onboarding/domain/errors';

export type UiErrorCode = keyof typeof viErrors;
export type UiError = { code: UiErrorCode };

function isUiErrorCode(value: string): value is UiErrorCode {
  return Object.prototype.hasOwnProperty.call(viErrors, value);
}

function descriptorCode(value: unknown): string | null {
  if (value instanceof Error || typeof value !== 'object' || value === null) return null;
  const descriptor = value as Readonly<Record<string, unknown>>;
  return typeof descriptor.code === 'string' ? descriptor.code : null;
}

export function toUiError(error: unknown): UiError {
  if (error instanceof Error && error.name === 'Error' && isUiErrorCode(error.message)) return { code: error.message };
  const code = descriptorCode(error) ?? classifyError(error).code;
  if (code === 'NOT_ALLOWED' || code === 'RATE_LIMITED') return { code };
  if (code.startsWith('HTTP_')) return { code: 'HUB_REJECTED' };
  return { code: isUiErrorCode(code) ? code : 'UNKNOWN' };
}
