// src/ui/onboarding/views/ErrorBanner.tsx
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../i18n/error-message';
import { toUiError } from '../../i18n/ui-error';

export function ErrorBanner({ error }: { error: unknown | null }) {
  const { t } = useTranslation('errors');
  if (error === null || error === undefined) return null;
  return <div className="error-message" role="alert">{getErrorMessage(toUiError(error), t)}</div>;
}
