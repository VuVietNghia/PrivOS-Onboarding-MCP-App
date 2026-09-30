// src/ui/onboarding/views/OnboardingPanel.tsx
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboardingSession } from '../../composition/PrivosOnboardingRoot';
import { useUiLocale } from '../../i18n/OnboardingI18nProvider';
import { isRoomAdmin } from '../domain/roles';
import { V4Onboarding } from './V4Onboarding';
export { probeIdentityKey, probeSurfaceKey } from '../dev/probe-keys';

const DiagnosticsEntry = import.meta.env.DEV ? lazy(() => import('../dev/DiagnosticsEntry')) : null;

export default function OnboardingPanel() {
  const session = useOnboardingSession();
  if (!session) throw new Error('ONBOARDING_SESSION_MISSING');
  const { locale } = useUiLocale();
  const { t } = useTranslation('common');
  const { roomId, userId, roles: userRoles } = session.actor;
  const [employeePreview, setEmployeePreview] = useState({ key: session.key, active: false });
  if (!roomId) return <div className="onboarding-v4" lang={locale}><div className="container"><p className="loading-text">{t('fallback.roomRequired')}</p></div></div>;
  const admin = isRoomAdmin(userRoles ?? []);
  const previewActive = admin && employeePreview.key === session.key && employeePreview.active;
  return (
    <>
      <V4Onboarding key={session.key} admin={admin && !previewActive}
        employeePreviewControl={admin ? {
          active: previewActive,
          onToggle: () => setEmployeePreview({ key: session.key, active: !previewActive }),
        } : undefined} />
      {DiagnosticsEntry && <Suspense fallback={null}><DiagnosticsEntry roomId={roomId} userId={userId} admin={admin} /></Suspense>}
    </>
  );
}
