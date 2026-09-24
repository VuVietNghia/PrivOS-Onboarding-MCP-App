import type { ReactNode } from 'react';

export type OnboardingScreen = 'hires' | 'provision' | 'templates' | 'roadmap';
export type OnboardingLocale = 'vi' | 'en';
export type OnboardingTheme = 'light' | 'dark' | 'brand';

const labels = {
  vi: { navigation: 'Điều hướng chính', administration: 'Quản trị', hires: 'Nhân sự', provision: 'Onboarding mới', templates: 'Template', roadmap: 'Lộ trình của tôi', language: 'Ngôn ngữ', appearance: 'Giao diện', light: 'Giao diện sáng', dark: 'Giao diện tối', brand: 'Giao diện thương hiệu', workspace: 'Không gian học tập', room: 'Room', onboarding: 'Onboarding' },
  en: { navigation: 'Main navigation', administration: 'Administration', hires: 'People', provision: 'New onboarding', templates: 'Templates', roadmap: 'My roadmap', language: 'Language', appearance: 'Appearance', light: 'Light theme', dark: 'Dark theme', brand: 'Brand theme', workspace: 'Learning workspace', room: 'Room', onboarding: 'Onboarding' },
} satisfies Record<OnboardingLocale, Record<string, string>>;

export interface OnboardingShellProps {
  role: 'admin' | 'employee';
  roomId: string;
  screen: OnboardingScreen;
  onNavigate: (screen: OnboardingScreen) => void;
  children: ReactNode;
  locale?: OnboardingLocale;
  onLocaleChange?: (locale: OnboardingLocale) => void;
  theme?: OnboardingTheme;
  onThemeChange?: (theme: OnboardingTheme) => void;
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

export function OnboardingShell({ role, roomId, screen, onNavigate, children, locale = 'vi', onLocaleChange, theme = 'light', onThemeChange }: OnboardingShellProps) {
  const t = labels[locale];
  const pages: { id: OnboardingScreen; title: string }[] = role === 'admin'
    ? [{ id: 'hires', title: t.hires }, { id: 'provision', title: t.provision }, { id: 'templates', title: t.templates }]
    : [{ id: 'roadmap', title: t.roadmap }];
  const currentTitle = pages.find((page) => page.id === screen)?.title ?? pages[0].title;

  return <div className="onboarding-v4" data-theme-mode={theme}>
    <div className="v4-app">
      <aside className="v4-sidebar" aria-label={t.navigation}>
        <div className="v4-brand"><span className="v4-brand-mark" aria-hidden="true" /><span><strong>PrivOS Onboarding</strong><small>{t.workspace}</small></span></div>
        {role === 'admin' && <div className="v4-nav-label">{t.administration}</div>}
        <nav className="v4-nav" aria-label={t.navigation}>{pages.map((page) => <button key={page.id} type="button" className={`v4-nav-button${screen === page.id ? ' active' : ''}`} aria-label={page.title} aria-current={screen === page.id ? 'page' : undefined} onClick={() => onNavigate(page.id)}><NavIcon screen={page.id} /><span>{page.title}</span></button>)}</nav>
        <div className="v4-room-note"><strong>{t.room}</strong><span>{roomId}</span></div>
      </aside>
      <div className="v4-shell">
        <header className="v4-topbar"><div className="v4-context"><strong>{currentTitle}</strong><span>{roomId} / {t.onboarding}</span></div>
          <div className="v4-top-actions">
            <div className="v4-language" role="group" aria-label={t.language}>{(['vi', 'en'] as const).map((value) => <button key={value} type="button" className={locale === value ? 'active' : ''} aria-pressed={locale === value} onClick={() => onLocaleChange?.(value)}>{value.toUpperCase()}</button>)}</div>
            <div className="v4-themes" role="group" aria-label={t.appearance}>{(['light', 'dark', 'brand'] as const).map((value) => <button key={value} type="button" className={`v4-theme-dot${theme === value ? ' active' : ''}`} data-theme={value} aria-label={t[value]} aria-pressed={theme === value} onClick={() => onThemeChange?.(value)} />)}</div>
          </div>
        </header>
        <main className="v4-main">{children}</main>
      </div>
    </div>
  </div>;
}
