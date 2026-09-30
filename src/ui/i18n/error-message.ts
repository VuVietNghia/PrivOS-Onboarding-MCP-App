import type { TFunction } from 'i18next';
import type { UiError } from './ui-error';

export function getErrorMessage(error: UiError, t: TFunction<'errors'>): string {
  return t(error.code);
}
