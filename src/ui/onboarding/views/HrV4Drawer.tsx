import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalogs } from '../data/catalogs';
import type { Hire } from '../domain/models';
import type { PreparedProvisionV4 } from '../ports/provision';
import type { OnboardingServices } from '../ports/ui-services';
import { toUiError, type UiError } from '../../i18n/ui-error';
import { getErrorMessage } from '../../i18n/error-message';
import { useUiLocale } from '../../i18n/OnboardingI18nProvider';
import { formatDateOnly } from '../../i18n/formatters';
import { StatusBadge } from '../components/StatusBadge';
import { useDialogFocus } from './use-dialog-focus';

interface Props {
  catalogs: Catalogs;
  services: Pick<OnboardingServices, 'hr' | 'provision'>;
  hireId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function HrV4Drawer({ catalogs, services, hireId, onClose, onChanged }: Props) {
  const { t } = useTranslation('admin');
  const { t: commonT } = useTranslation('common');
  const { t: errorT } = useTranslation('errors');
  const { locale } = useUiLocale();
  const [hire, setHire] = useState<Hire | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const closeConfirmation = useCallback(() => setConfirmCancel(false), []);
  useDialogFocus({ open: true, onClose, containerRef: drawerRef, initialFocusRef: closeRef });
  useDialogFocus({ open: confirmCancel, onClose: closeConfirmation, containerRef: confirmRef, initialFocusRef: keepRef });
  const actions = services.hr;
  useEffect(() => {
    let active = true;
    setHire(null); setError(null);
    void catalogs.hire(hireId).then((value) => { if (active) setHire(value); })
      .catch((cause: unknown) => { if (active) setError(toUiError(cause)); });
    return () => { active = false; };
  }, [catalogs, hireId]);

  const act = async (action: 'cancel' | 'resume' | 'recount') => {
    if (!hire || busy) return;
    setBusy(true); setError(null);
    try {
      if (action === 'cancel') {
        if (hire.status === 'failed') await actions.cancelFailed(hire.id);
        else await actions.cancelActive(hire.id);
      } else if (action === 'recount') await actions.recountPosition(hire.positionId);
      else {
        const position = await catalogs.position(hire.positionId);
        const tree = await catalogs.template(position.templateListId);
        const operationId = await services.provision.operationId(hire.id);
        const prepared: PreparedProvisionV4 = { input: { positionId: hire.positionId, employeeId: hire.employeeId,
          employeeName: hire.name, startDate: hire.startDate, operationId }, position, tree,
          fingerprint: await services.provision.fingerprint(tree) };
        await services.provision.resume(hire.id, prepared);
      }
      setConfirmCancel(false);
      if (action === 'cancel' && hire.status === 'failed') onClose();
      else setHire(await catalogs.hire(hire.id));
      onChanged();
    } catch (cause) { setError(toUiError(cause)); }
    finally { setBusy(false); }
  };

  return <div className="v4-drawer-scrim" role="presentation" onClick={() => { if (!confirmCancel) onClose(); }}>
    <aside ref={drawerRef} className="v4-drawer" role="dialog" aria-modal="true" aria-label={t('drawer.label')} onClick={(event) => event.stopPropagation()}>
      <header className="v4-drawer-top"><div><p className="v4-eyebrow">{commonT('shell.onboarding')}</p><h2>{hire?.name ?? t('drawer.loading')}</h2></div><button ref={closeRef} type="button" onClick={onClose}>{t('drawer.close')}</button></header>
      {error && <p role="alert">{getErrorMessage(error, errorT)}</p>}
      {hire && <div className="v4-drawer-content"><p><strong>{t('drawer.position')}</strong> {hire.positionName}</p><p><strong>{t('drawer.startDate')}</strong> {formatDateOnly(hire.startDate, locale)}</p>
        <p><strong>{t('drawer.status')}</strong> <StatusBadge status={hire.status} /></p><p><strong>{t('drawer.progress')}</strong> {hire.doneDays}/{hire.totalDays} {t('days')}</p>
        <h3>{t('drawer.scores')}</h3>{Object.keys(hire.scores).length ? <ul>{Object.entries(hire.scores).map(([day, score]) =>
          <li key={day}>{t('drawer.scoreDay', { day, score: score.first })}{score.attempts?.length ? ` · ${score.attempts.join(', ')}` : ''}</li>)}</ul> : <p>{t('drawer.noScores')}</p>}
        {(hire.status === 'failed' || hire.status === 'provisioning') && <button type="button" disabled={busy} onClick={() => void act('resume')}>{t('drawer.resume')}</button>}
        {(hire.status === 'learning' || hire.status === 'done' || hire.status === 'failed') && <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)}>{t('drawer.cancel')}</button>}
        <button type="button" disabled={busy} onClick={() => void act('recount')}>{t('drawer.recount')}</button>
      </div>}
      {confirmCancel && hire && <div ref={confirmRef} className="v4-builder-dialog" role="alertdialog" aria-modal="true" aria-label={t('drawer.confirmLabel')}>
        <h3>{t('drawer.confirmTitle', { name: hire.name })}</h3><p>{t('drawer.confirmBody')}</p>
        <button ref={keepRef} type="button" onClick={closeConfirmation} disabled={busy}>{t('drawer.keep')}</button>
        <button type="button" onClick={() => void act('cancel')} disabled={busy}>{busy ? t('drawer.cancelling') : t('drawer.confirmCancel')}</button>
      </div>}
    </aside>
  </div>;
}
