// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Question } from '../../src/ui/onboarding/domain/models';
import { QuizView } from '../../src/ui/onboarding/views/learning/QuizView';
import { QuizResult } from '../../src/ui/onboarding/views/learning/QuizResult';

afterEach(cleanup);

const questions: Question[] = [
  { id: 'q1', kind: 'question', name: 'Câu 1', stageId: 'w', order: 0, parentId: 'd', content: 'Chọn một', options: ['A', 'B'], correctLabels: ['b'], explanation: 'Vì B đúng', selectedLabels: [], correct: null },
  { id: 'q2', kind: 'question', name: 'Câu 2', stageId: 'w', order: 1, parentId: 'd', content: 'Chọn nhiều', options: ['C', 'D', 'E'], correctLabels: ['a', 'c'], explanation: 'Vì C và E đúng', selectedLabels: [], correct: null },
];

describe('quiz UI', () => {
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
    ] }} attempt={2} firstScore="0/2" onRetake={onRetake} />);
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByText(/Vì B đúng/)).toBeTruthy();
    expect(screen.getByText(/Điểm lần đầu: 0\/2/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Làm lại' }));
    expect(onRetake).toHaveBeenCalledOnce();
  });
});
