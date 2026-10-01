// src/ui/onboarding/views/OnboardingPanel.tsx
import { useState } from 'react';
// Diagnostics are temporarily disabled; restore these imports with the entry below.
// import { lazy, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnboardingSession } from '../../composition/PrivosOnboardingRoot';
import { useUiLocale } from '../../i18n/OnboardingI18nProvider';
import { isRoomAdmin } from '../domain/roles';
import { V4Onboarding } from './V4Onboarding';
// import type { OnboardingTheme } from './OnboardingShell';
import { useTheme } from '../../theme-provider';
export { probeIdentityKey, probeSurfaceKey } from '../dev/probe-keys';

// const DiagnosticsEntry = import.meta.env.DEV ? lazy(() => import('../dev/DiagnosticsEntry')) : null;

export default function OnboardingPanel() {
  const session = useOnboardingSession();
  if (!session) throw new Error('ONBOARDING_SESSION_MISSING');
  const { locale } = useUiLocale();
  const { resolved } = useTheme();
  const { t } = useTranslation('common');
  const { roomId, /* userId, */ roles: userRoles } = session.actor;
  const [employeePreview, setEmployeePreview] = useState({ key: session.key, active: false });
  // const [reportedTheme, setReportedTheme] = useState<{ key: string; theme: OnboardingTheme } | null>(null);
  // const reportTheme = useCallback((theme: OnboardingTheme) => setReportedTheme({ key: session.key, theme }), [session.key]);
  // const diagnosticsTheme = reportedTheme?.key === session.key ? reportedTheme.theme : session.hostTheme;
  if (!roomId) return <div className="onboarding-v4" data-theme-mode={resolved} lang={locale}><div className="v4-recovery"><p>{t('fallback.roomRequired')}</p></div></div>;
  const admin = isRoomAdmin(userRoles ?? []);
  const previewActive = admin && employeePreview.key === session.key && employeePreview.active;
  return (
    <>
      {/* Restore onResolvedThemeChange={reportTheme} when diagnostics are enabled. */}
      <V4Onboarding key={session.key} admin={admin && !previewActive}
        employeePreviewControl={admin ? {
          active: previewActive,
          onToggle: () => setEmployeePreview({ key: session.key, active: !previewActive }),
        } : undefined} />
      {/* {DiagnosticsEntry && <Suspense fallback={null}><DiagnosticsEntry roomId={roomId} userId={userId} admin={admin} theme={diagnosticsTheme} /></Suspense>} */}
    </>
  );
}
