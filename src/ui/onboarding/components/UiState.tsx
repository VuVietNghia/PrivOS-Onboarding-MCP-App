import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function UiState({ kind, children, onRetry }: {
  kind: 'loading' | 'empty' | 'error';
  children: ReactNode;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('admin');
  const role = kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined;
  return <div className={`v4-table-state${kind === 'error' ? ' v4-table-error' : ''}`} role={role}>
    <p>{children}</p>
    {onRetry && <button type="button" className="v4-secondary-button" onClick={onRetry}>{t('reload')}</button>}
  </div>;
}
