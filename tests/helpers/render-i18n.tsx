import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n } from 'i18next';
import { createUiI18n } from '../../src/ui/i18n/config';
import type { UiLocale } from '../../src/ui/i18n/locale';

export function renderI18n(ui: ReactElement, locale: UiLocale = 'vi'): RenderResult & {
  i18n: i18n;
  user: ReturnType<typeof userEvent.setup>;
} {
  const instance = createUiI18n(locale);
  const user = userEvent.setup();
  return Object.assign(render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>), {
    i18n: instance,
    user,
  });
}
