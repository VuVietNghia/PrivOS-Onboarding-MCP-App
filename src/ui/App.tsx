import { useEffect } from 'react';
import { PrivosAppProvider, usePrivosContext } from '@privos_ai/app-react';
import { ThemeProvider } from './theme-provider';
import { LazyBoundary } from './lazy-boundary';
import OnboardingPanel from './onboarding/views/OnboardingPanel';
import { PrivosOnboardingRoot } from './composition/PrivosOnboardingRoot';
import { createBrowserPresentation, createBrowserThemePreferences } from './adapters/browser-effects';

const presentation = createBrowserPresentation();
const themePreferences = createBrowserThemePreferences();

declare global {
  interface Window {
    /** Read by the shell's inline boot watchdog (see the `ui://…/form.html` resource). */
    __privosUiBooted?: boolean;
  }
}

function ThemedApp() {
  const { theme } = usePrivosContext();
  return (
    <ThemeProvider hostTheme={theme} preferences={themePreferences} target={presentation.themeTarget}>
      <LazyBoundary reloadPage={presentation.reloadPage} logger={presentation.logger}>
        <PrivosOnboardingRoot><OnboardingPanel /></PrivosOnboardingRoot>
      </LazyBoundary>
    </ThemeProvider>
  );
}

export default function App() {
  useEffect(() => {
    // Tells the shell's inline boot watchdog that the bundle mounted.
    window.__privosUiBooted = true;
  }, []);

  return (
    <PrivosAppProvider>
      <ThemedApp />
    </PrivosAppProvider>
  );
}
