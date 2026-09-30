import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UiLocale } from '../../i18n/locale';

export type OnboardingScreen = 'hires' | 'provision' | 'templates' | 'roadmap';
export type OnboardingTheme = 'light' | 'dark' | 'brand';

export interface OnboardingShellProps {
  role: 'admin' | 'employee';
  roomId: string;
  screen: OnboardingScreen;
  onNavigate: (screen: OnboardingScreen) => void;
  children: ReactNode;
  locale?: UiLocale;
  onLocaleChange?: (locale: UiLocale) => void;
  theme?: OnboardingTheme;
  onThemeChange?: (theme: OnboardingTheme) => void;
  employeePreviewControl?: { active: boolean; onToggle: () => void };
}

function NavIcon({ screen }: { screen: OnboardingScreen }) {
  const paths: Record<OnboardingScreen, ReactNode> = {
    hires: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    provision: <path d="M12 5v14M5 12h14" />,
    templates: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    roadmap: <><circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M6 16V8a3 3 0 0 1 3-3h6M18 8v8a3 3 0 0 1-3 3H9" /></>,
  };
  return <svg className="v4-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[screen]}</svg>;
}

export function OnboardingShell({ role, roomId, screen, onNavigate, children, locale = 'vi', onLocaleChange, theme = 'light', onThemeChange, employeePreviewControl }: OnboardingShellProps) {
  const { t } = useTranslation('common');
  const pages: { id: OnboardingScreen; title: string }[] = role === 'admin'
    ? [{ id: 'hires', title: t('shell.hires') }, { id: 'provision', title: t('shell.provision') }, { id: 'templates', title: t('shell.templates') }]
    : [{ id: 'roadmap', title: t('shell.roadmap') }];
  const currentTitle = pages.find((page) => page.id === screen)?.title ?? pages[0].title;

  return <div className="onboarding-v4" data-theme-mode={theme} lang={locale}>
    <div className="v4-app">
      <aside className="v4-sidebar" aria-label={t('shell.navigation')}>
        <div className="v4-brand"><span className="v4-brand-mark" aria-hidden="true" /><span><strong>PrivOS Onboarding</strong><small>{t('shell.workspace')}</small></span></div>
        {role === 'admin' && <div className="v4-nav-label">{t('shell.administration')}</div>}
        <nav className="v4-nav" aria-label={t('shell.navigation')}>{pages.map((page) => <button key={page.id} type="button" className={`v4-nav-button${screen === page.id ? ' active' : ''}`} aria-label={page.title} aria-current={screen === page.id ? 'page' : undefined} onClick={() => onNavigate(page.id)}><NavIcon screen={page.id} /><span>{page.title}</span></button>)}</nav>
        <div className="v4-room-note"><strong>{t('shell.room')}</strong><span>{roomId}</span></div>
      </aside>
      <div className="v4-shell">
        <header className="v4-topbar"><div className="v4-context"><strong>{currentTitle}</strong><span>{roomId} / {t('shell.onboarding')}</span></div>
          <div className="v4-top-actions">
            {employeePreviewControl?.active && <span className="v4-employee-preview-status" role="status">{t('shell.previewMode')}</span>}
            {employeePreviewControl && <button type="button" className="v4-employee-preview-button" onClick={employeePreviewControl.onToggle}>
              {employeePreviewControl.active ? t('shell.previewAdmin') : t('shell.previewEmployee')}</button>}
            <div className="v4-language" role="group" aria-label={t('shell.language')}>{(['vi', 'en'] as const).map((value) => <button key={value} type="button" className={locale === value ? 'active' : ''} aria-pressed={locale === value} onClick={() => onLocaleChange?.(value)}>{value.toUpperCase()}</button>)}</div>
            <div className="v4-themes" role="group" aria-label={t('shell.appearance')}>{(['light', 'dark', 'brand'] as const).map((value) => <button key={value} type="button" className={`v4-theme-dot${theme === value ? ' active' : ''}`} data-theme={value} aria-label={t(`shell.${value}`)} aria-pressed={theme === value} onClick={() => onThemeChange?.(value)} />)}</div>
          </div>
        </header>
        <main className="v4-main">{children}</main>
      </div>
    </div>
  </div>;
}
