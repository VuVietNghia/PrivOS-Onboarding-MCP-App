// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from '../../src/ui/onboarding/views/ErrorBanner';
import { OnboardingError } from '../../src/ui/onboarding/domain/errors';
import { renderI18n } from '../helpers/render-i18n';

afterEach(cleanup);

describe('ErrorBanner', () => {
  it('changes language without retrying the failed operation', async () => {
    const operation = vi.fn(() => new OnboardingError('QUIZ_INCOMPLETE', 'q-secret'));
    function Harness() {
      const [error, setError] = useState<unknown>(null);
      const { i18n } = useTranslation();
      return <>
        <button type="button" onClick={() => setError(operation())}>Run</button>
        <button type="button" onClick={() => void i18n.changeLanguage('en')}>English</button>
        <ErrorBanner error={error} />
      </>;
    }

    const { user } = renderI18n(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByRole('alert').textContent).toBe('Hãy trả lời đủ câu hỏi trước khi nộp.');
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('alert').textContent).toBe('Answer every question before submitting.');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).not.toContain('q-secret');
    expect(screen.getByRole('alert').textContent).not.toContain('QUIZ_INCOMPLETE');
  });
});
