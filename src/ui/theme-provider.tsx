/**
 * Theme provider — syncs with Privos host theme or allows manual override.
 * Modes: 'auto' (follow host dark/light), 'light', 'dark'.
 * Sets data-theme attribute on <html> for CSS targeting.
 * Background colors are defined in CSS per theme — no inline overrides.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Preferences } from '../shared/ports/effects';
import type { ThemeTarget } from './ports/presentation';
import { useTranslation } from 'react-i18next';

type ThemeMode = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  resolved: 'light',
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Host theme from Privos (via usePrivosContext().theme) */
  hostTheme: string;
  preferences: Preferences;
  target: ThemeTarget;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children, hostTheme, preferences, target }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    let active = true;
    void preferences.get('theme-mode').then((value) => {
      if (active) setModeState(isThemeMode(value) ? value : 'auto');
    }).catch(() => { if (active) setModeState('auto'); });
    return () => { active = false; };
  }, [preferences]);

  const setMode = useCallback((m: ThemeMode) => {
    if (!isThemeMode(m)) return;
    setModeState(m);
    void preferences.set('theme-mode', m).catch(() => {});
  }, [preferences]);

  const hostIsDark = hostTheme === 'dark' || hostTheme === 'high-contrast';
  const resolved: ResolvedTheme = mode === 'auto'
    ? (hostIsDark ? 'dark' : 'light')
    : mode;

  useEffect(() => {
    target.apply(resolved);
  }, [resolved, target]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Small theme toggle button */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation('common');
  const options: { value: ThemeMode; label: string }[] = [
    { value: 'auto', label: t('theme.auto') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
  ];

  return (
    <div className="theme-toggle">
      {options.map((o) => (
        <button
          key={o.value}
          className={`theme-toggle-btn ${mode === o.value ? 'active' : ''}`}
          onClick={() => setMode(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
