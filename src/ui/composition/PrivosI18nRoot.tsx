import { useMemo, type ReactNode } from 'react';
import { usePrivosApp, usePrivosContext } from '@privos_ai/app-react';
import { browserLocale, createPrivosPreferences } from '../adapters/browser-effects';
import { OnboardingI18nProvider } from '../i18n/OnboardingI18nProvider';

export function PrivosI18nRoot({ children }: { children: ReactNode }) {
  const app = usePrivosApp();
  const context = usePrivosContext();
  const preferences = useMemo(() => createPrivosPreferences(app, ''), [app]);

  return (
    <OnboardingI18nProvider
      userId={context.userId ?? ''}
      preferences={preferences}
      browserLocale={browserLocale()}
    >
      {children}
    </OnboardingI18nProvider>
  );
}
