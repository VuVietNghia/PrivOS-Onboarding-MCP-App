import { useTranslation } from 'react-i18next';
import type { ProvisionPhase, ProvisionProgress } from '../ports/provision';

function assertNever(value: never): never {
  throw new Error(`Unexpected provision phase: ${String(value)}`);
}

function phaseKey(phase: ProvisionPhase): 'record' | 'list' | 'content' | 'grant' | 'activate' | 'recount' {
  switch (phase) {
    case 'record': return 'record';
    case 'list': return 'list';
    case 'content': return 'content';
    case 'grant': return 'grant';
    case 'activate': return 'activate';
    case 'recount': return 'recount';
    default: return assertNever(phase);
  }
}

export function ProvisionProgressView({ progress }: { progress: ProvisionProgress }) {
  const { t } = useTranslation('provision');
  const phase = t(`phase.${phaseKey(progress.phase)}`);
  const label = t('progressValue', { phase, completed: progress.completed, total: progress.total });
  if (progress.total <= 0) return <p role="status" aria-label={t('progressLabel')}>{label}</p>;
  return <div role="progressbar" aria-label={t('progressLabel')} aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={Math.min(progress.completed, progress.total)}>{label}</div>;
}
