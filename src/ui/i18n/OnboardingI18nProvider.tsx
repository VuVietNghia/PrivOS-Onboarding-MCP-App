import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Preferences } from '../../shared/ports/effects';
import { createUiI18n } from './config';
import { resolveLocale, type UiLocale } from './locale';

interface UiLocaleContextValue {
  locale: UiLocale;
  setLocale(next: UiLocale): void;
}

const UiLocaleContext = createContext<UiLocaleContextValue | null>(null);

export interface OnboardingI18nProviderProps {
  userId: string;
  preferences: Preferences;
  hostLocale?: string;
  browserLocale?: string;
  children: ReactNode;
}

function preferenceKey(userId: string): string {
  return `ui:language:${userId}`;
}

export function OnboardingI18nProvider({
  userId,
  preferences,
  hostLocale,
  browserLocale,
  children,
}: OnboardingI18nProviderProps) {
  const fallback = resolveLocale(undefined, hostLocale, browserLocale);
  const [locale, setLocaleState] = useState<UiLocale>(fallback);
  const i18nRef = useRef<ReturnType<typeof createUiI18n> | null>(null);
  const readRevisionRef = useRef(0);
  const choiceRevisionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  if (!i18nRef.current) i18nRef.current = createUiI18n(fallback);
  const instance = i18nRef.current;

  useEffect(() => {
    const readRevision = ++readRevisionRef.current;
    const choiceRevision = choiceRevisionRef.current;
    let active = true;

    setLocaleState(fallback);
    void instance.changeLanguage(fallback);
    if (!userId) return () => { active = false; };

    void preferences.get(preferenceKey(userId)).then((saved) => {
      if (!active || readRevisionRef.current !== readRevision || choiceRevisionRef.current !== choiceRevision) return;
      const next = resolveLocale(saved, hostLocale, browserLocale);
      setLocaleState(next);
      void instance.changeLanguage(next);
    }).catch(() => {
      if (!active || readRevisionRef.current !== readRevision || choiceRevisionRef.current !== choiceRevision) return;
      setLocaleState(fallback);
      void instance.changeLanguage(fallback);
    });

    return () => { active = false; };
  }, [browserLocale, fallback, hostLocale, instance, preferences, userId]);

  const setLocale = useCallback((next: UiLocale) => {
    choiceRevisionRef.current += 1;
    setLocaleState(next);
    void instance.changeLanguage(next);
    if (!userId) return;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => preferences.set(preferenceKey(userId), next))
      .catch(() => undefined);
  }, [instance, preferences, userId]);

  const contextValue = useMemo<UiLocaleContextValue>(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <UiLocaleContext.Provider value={contextValue}>
      <I18nextProvider i18n={instance}>{children}</I18nextProvider>
    </UiLocaleContext.Provider>
  );
}

export function useUiLocale(): UiLocaleContextValue {
  const value = useContext(UiLocaleContext);
  if (!value) throw new Error('useUiLocale must be used inside OnboardingI18nProvider');
  return value;
}
