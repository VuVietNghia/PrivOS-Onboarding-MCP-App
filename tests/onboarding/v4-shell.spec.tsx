import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import { OnboardingShell } from '../../src/ui/onboarding/views/OnboardingShell';
import { createUiI18n } from '../../src/ui/i18n/config';

function renderShell(ui: ReactElement): string {
  return renderToStaticMarkup(<I18nextProvider i18n={createUiI18n('vi')}>{ui}</I18nextProvider>);
}

describe('v4 onboarding shell', () => {
  it('shows only HR navigation for a room administrator', () => {
    const html = renderShell(
      <OnboardingShell role="admin" roomId="room-1" screen="hires" onNavigate={() => {}}>
        <p>Actual list content</p>
      </OnboardingShell>,
    );
    expect(html).toContain('PrivOS Onboarding');
    expect(html).toContain('Nhân sự');
    expect(html).toContain('Template');
    expect(html).toContain('Actual list content');
    expect(html).not.toContain('Chọn vai trò');
    expect(html).not.toContain('Lộ trình của tôi');
  });

  it('shows only the personal roadmap navigation to a member', () => {
    const html = renderShell(
      <OnboardingShell role="employee" roomId="room-1" screen="roadmap" onNavigate={() => {}}>
        <p>Personal content</p>
      </OnboardingShell>,
    );
    expect(html).toContain('Lộ trình của tôi');
    expect(html).toContain('Personal content');
    expect(html).not.toContain('Template');
    expect(html).not.toContain('Onboarding mới');
  });
});
