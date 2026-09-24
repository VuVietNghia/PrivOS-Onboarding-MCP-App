import { useEffect } from 'react';
import { PrivosAppProvider, usePrivosContext } from '@privos_ai/app-react';
import { ThemeProvider } from './theme-provider';
import { LazyBoundary } from './lazy-boundary';
import OnboardingPanel from './onboarding/views/OnboardingPanel';

declare global {
  interface Window {
    /** Read by the shell's inline boot watchdog (see the `ui://…/form.html` resource). */
    __privosUiBooted?: boolean;
  }
}

function ThemedApp() {
  const { theme } = usePrivosContext();
  return (
    <ThemeProvider hostTheme={theme}>
      <LazyBoundary>
        <OnboardingPanel />
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
