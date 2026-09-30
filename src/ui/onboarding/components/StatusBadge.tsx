import { useTranslation } from 'react-i18next';
import type { HireStatus, PositionStatus } from '../domain/models';

type Status = HireStatus | PositionStatus;

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation('admin');
  const labels: Record<Status, string> = {
    provisioning: t('hireStatus.provisioning'),
    learning: t('hireStatus.learning'),
    done: t('hireStatus.done'),
    failed: t('hireStatus.failed'),
    cancelled: t('hireStatus.cancelled'),
    draft: t('positionStatus.draft'),
    ready: t('positionStatus.ready'),
    disabled: t('positionStatus.disabled'),
  };
  return <span className={`v4-badge v4-badge-${status}`}>{labels[status]}</span>;
}
