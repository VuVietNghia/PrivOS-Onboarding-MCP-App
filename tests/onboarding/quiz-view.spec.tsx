// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as testingRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Question } from '../../src/ui/onboarding/domain/models';
import { QuizView } from '../../src/ui/onboarding/views/learning/QuizView';
import { QuizResult } from '../../src/ui/onboarding/views/learning/QuizResult';
import { createUiI18n } from '../../src/ui/i18n/config';
import type { UiLocale } from '../../src/ui/i18n/locale';

function render(ui: ReactElement, locale: UiLocale = 'vi') {
  const Wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={createUiI18n(locale)}>{children}</I18nextProvider>;
  return testingRender(ui, { wrapper: Wrapper });
}

afterEach(cleanup);

const questions: Question[] = [
  { id: 'q1', kind: 'question', name: 'Câu 1', stageId: 'w', order: 0, parentId: 'd', content: 'Chọn một', options: ['A', 'B'], correctLabels: ['b'], explanation: 'Vì B đúng', selectedLabels: [], correct: null },
  { id: 'q2', kind: 'question', name: 'Câu 2', stageId: 'w', order: 1, parentId: 'd', content: 'Chọn nhiều', options: ['C', 'D', 'E'], correctLabels: ['a', 'c'], explanation: 'Vì C và E đúng', selectedLabels: [], correct: null },
];

describe('quiz UI', () => {
  it.each([
    ['vi', 'Câu 1: Chọn một', 'Câu 2: Chọn nhiều'],
    ['en', 'Question 1: Chọn một', 'Question 2: Chọn nhiều'],
  ] as const)('keeps question headings inside their answer groups in %s', (locale, first, second) => {
    render(<QuizView questions={questions} onSubmit={vi.fn()} />, locale);
    const single = screen.getByRole('group', { name: first });
    const multiple = screen.getByRole('group', { name: second });
    expect(within(single).getByRole('heading', { level: 2, name: first })).toBeTruthy();
    expect(within(multiple).getByRole('heading', { level: 2, name: second })).toBeTruthy();
    expect(within(single).getAllByRole('radio')).toHaveLength(2);
    expect(within(multiple).getAllByRole('checkbox')).toHaveLength(3);
  });

  it.each([
    ['vi', 'Câu 1: Chọn một', 'Câu 2: Chọn nhiều', 'Đáp án đúng: B'],
    ['en', 'Question 1: Chọn một', 'Question 2: Chọn nhiều', 'Correct answer: B'],
  ] as const)('includes the question number inside each result card in %s', (locale, first, second, correctAnswer) => {
    render(<QuizResult questions={questions} grade={{ score: 1, total: 2, results: [
      { itemId: 'q1', correct: true, correctLabels: ['b'], explanation: 'Vì B đúng' },
      { itemId: 'q2', correct: false, correctLabels: ['a', 'c'], explanation: 'Vì C và E đúng' },
    ] }} attempts={['1/2']} firstScore="1/2" onRetake={vi.fn()} />, locale);
    const cards = screen.getAllByRole('listitem');
    expect(within(cards[0]).getByRole('heading', { level: 2, name: first })).toBeTruthy();
    expect(within(cards[1]).getByRole('heading', { level: 2, name: second })).toBeTruthy();
    expect(within(cards[0]).getByText(correctAnswer)).toBeTruthy();
  });

  it('blocks duplicate submissions and keeps answers after a failed save for retry', async () => {
    const user = userEvent.setup();
    let rejectSave: (cause: Error) => void = () => { throw new Error('SAVE_NOT_STARTED'); };
    const onSubmit = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    render(<QuizView questions={questions} onSubmit={onSubmit} />, 'en');
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('checkbox', { name: 'C' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving.hasAttribute('disabled')).toBe(true);
    await user.click(saving);
    expect(onSubmit).toHaveBeenCalledOnce();
    rejectSave(new Error('PRIVATE_DRIVER_DETAIL'));
    expect((await screen.findByRole('alert')).textContent).not.toContain('PRIVATE_DRIVER_DETAIL');
    expect(screen.getByRole('radio', { name: 'B' }).matches(':checked')).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'C' }).matches(':checked')).toBe(true);
    onSubmit.mockImplementation(async () => {});
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith({ q1: ['b'], q2: ['a'] });
  });

  it('preserves radio and checkbox answers when the theme changes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const quiz = (theme: 'light' | 'dark' | 'brand') => <div className="onboarding-v4" data-theme-mode={theme}>
      <QuizView questions={questions} onSubmit={onSubmit} />
    </div>;
    const view = render(quiz('light'), 'en');
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('checkbox', { name: 'C' }));
    await user.click(screen.getByRole('checkbox', { name: 'E' }));
    for (const theme of ['dark', 'brand'] as const) {
      view.rerender(quiz(theme));
      expect(screen.getByRole('radio', { name: 'B' }).matches(':checked')).toBe(true);
      expect(screen.getByRole('checkbox', { name: 'C' }).matches(':checked')).toBe(true);
      expect(screen.getByRole('checkbox', { name: 'E' }).matches(':checked')).toBe(true);
      expect(screen.getByRole('status').textContent).toBe('Answered 2/2');
    }
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({ q1: ['b'], q2: ['a', 'c'] });
  });

  it('collects radio and checkbox answers without revealing correct choices', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuizView questions={questions} onSubmit={onSubmit} />);
    expect((screen.getByRole('button', { name: 'Nộp bài' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Vì B đúng')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('checkbox', { name: 'C' }));
    expect(screen.getByRole('status').textContent).toContain('2/2');
    await user.click(screen.getByRole('checkbox', { name: 'E' }));
    await user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(onSubmit).toHaveBeenCalledWith({ q1: ['b'], q2: ['a', 'c'] });
  });

  it('reveals answers only in a persisted result and offers retake', async () => {
    const user = userEvent.setup();
    const onRetake = vi.fn();
    render(<QuizResult questions={questions} grade={{ score: 1, total: 2, results: [
      { itemId: 'q1', correct: true, correctLabels: ['b'], explanation: 'Vì B đúng' },
      { itemId: 'q2', correct: false, correctLabels: ['a', 'c'], explanation: 'Vì C và E đúng' },
    ] }} attempts={['0/2', '1/2']} firstScore="0/2" onRetake={onRetake} />);
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText(/Vì B đúng/)).toBeTruthy();
    expect(screen.getByText(/Điểm lần đầu: 0\/2/)).toBeTruthy();
    expect(screen.getByText(/0\/2.*1\/2/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Làm lại' }));
    expect(onRetake).toHaveBeenCalledOnce();
  });

  it('localizes the quiz action bar and full attempt history in English', async () => {
    const user = userEvent.setup();
    render(<QuizView questions={questions} onSubmit={vi.fn()} />, 'en');
    expect(screen.getByRole('status').textContent).toBe('Answered 0/2');
    expect((screen.getByRole('button', { name: 'Submit answers' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('status').textContent).toBe('Answered 1/2');

    cleanup();
    render(<QuizResult questions={questions} grade={{ score: 1, total: 2, results: [
      { itemId: 'q1', correct: true, correctLabels: ['b'], explanation: 'Vì B đúng' },
      { itemId: 'q2', correct: false, correctLabels: ['a', 'c'], explanation: 'Vì C và E đúng' },
    ] }} attempts={['0/2', '1/2']} firstScore="0/2" onRetake={vi.fn()} />, 'en');
    expect(screen.getByText(/First score: 0\/2/)).toBeTruthy();
    expect(screen.getByText(/Attempts: 0\/2.*1\/2/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retake quiz' })).toBeTruthy();
  });
});
