// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as testingRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Day, Hire, Lesson, Question, Roadmap } from '../../src/ui/onboarding/domain/models';
import { EmployeeRoadmapScreen } from '../../src/ui/onboarding/views/learning/EmployeeRoadmapScreen';
import { WeekRoadmap } from '../../src/ui/onboarding/views/learning/WeekRoadmap';
import { DayLearningView } from '../../src/ui/onboarding/views/learning/DayLearningView';
import type { LoadedLearning, MemberRoadmapOption } from '../../src/ui/onboarding/ports/learning';
import { createUiI18n } from '../../src/ui/i18n/config';
import type { UiLocale } from '../../src/ui/i18n/locale';

function render(ui: ReactElement, locale: UiLocale = 'vi') {
  const Wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={createUiI18n(locale)}>{children}</I18nextProvider>;
  return testingRender(ui, { wrapper: Wrapper });
}

afterEach(cleanup);

const day: Day = { id: 'day-2', kind: 'day', name: 'Ngày 2', stageId: 'week-1', order: 2, parentId: null, content: 'Mục tiêu' };
const lesson: Lesson = { id: 'lesson-1', kind: 'lesson', name: 'Bài đọc', stageId: 'week-1', order: 0, parentId: 'day-2', content: 'Nội dung', attachments: [], videos: [], read: false };
const question: Question = { id: 'question-1', kind: 'question', name: 'Câu 1', stageId: 'week-1', order: 0, parentId: 'day-2', content: 'Chọn đáp án', options: ['A', 'B'], correctLabels: ['b'], explanation: 'Giải thích', selectedLabels: [], correct: null };

describe('employee learning views', () => {
  it('themes the unread, saving, and read lesson action', async () => {
    const user = userEvent.setup();
    const onRead = vi.fn();
    const props = { day, children: [lesson], onBack: vi.fn(), onQuiz: vi.fn(), onRead };
    const view = render(<DayLearningView {...props} />, 'en');
    const action = screen.getByRole('button', { name: 'Mark as read' });
    expect(action.classList.contains('v4-secondary-button')).toBe(true);
    await user.click(action);
    expect(onRead).toHaveBeenCalledOnce();
    expect(onRead).toHaveBeenCalledWith(lesson.id);

    view.rerender(<DayLearningView {...props} pendingLessonId={lesson.id} />);
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving.classList.contains('v4-secondary-button')).toBe(true);
    expect(saving.hasAttribute('disabled')).toBe(true);
    await user.click(saving);

    view.rerender(<DayLearningView {...props} children={[{ ...lesson, read: true }]} />);
    const read = screen.getByRole('button', { name: 'Read' });
    expect(read.classList.contains('v4-secondary-button')).toBe(true);
    expect(read.hasAttribute('disabled')).toBe(true);
    await user.click(read);
    expect(onRead).toHaveBeenCalledOnce();
  });

  it('uses the hire snapshot and lets employees open every day', async () => {
    const user = userEvent.setup();
    const hire: Hire = { id: 'hire-1', employeeId: 'user-1', name: 'B', positionId: 'position-1', positionName: 'Kỹ sư', totalDays: 2,
      startDate: '2026-09-24', roadmapListId: 'run-1', status: 'learning', doneDays: 1,
      scores: { '2': { first: '1/1', attempts: ['1/1'] } }, errorCode: null, pendingAction: null };
    const roadmap: Roadmap = { overviewId: 'overview-1', templateListId: 'template-1', tree: { weeks: [{ id: 'week-1', name: 'Tuần 1', order: 0 }], items: [day, lesson, question] } };
    const onDay = vi.fn();
    render(<WeekRoadmap roadmap={roadmap} hire={hire} onDay={onDay} />);
    expect(screen.getByText('Kỹ sư')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText(/1\/2/)).toBeTruthy();
    expect(screen.getByText(/24\/09\/2026/)).toBeTruthy();
    expect(screen.getByText(/Điểm lần đầu: 1\/1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tuần 1' }).getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: /Ngày 2/ }));
    expect(onDay).toHaveBeenCalledWith('day-2');
  });

  it('keeps quiz available before reading and disables only the pending lesson', async () => {
    const user = userEvent.setup();
    const onQuiz = vi.fn();
    const onRead = vi.fn();
    render(<DayLearningView day={day} children={[lesson, question]} pendingLessonId="lesson-1" onBack={vi.fn()}
      onQuiz={onQuiz} onRead={onRead} />);
    expect((screen.getByRole('button', { name: 'Đang lưu…' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Làm quiz' }));
    expect(onQuiz).toHaveBeenCalledOnce();
    expect(onRead).not.toHaveBeenCalled();
    expect(screen.queryByText('Giải thích')).toBeNull();
  });

  it('renders Markdown and keeps untrusted HTML and script links inert', () => {
    render(<DayLearningView day={day} children={[{ ...lesson,
      content: '# Hướng dẫn\n\n**Quan trọng** <script>window.x=1</script> [x](javascript:alert(1))',
      videos: ['javascript:alert(2)', 'https://video.example/lesson'],
    }]} onBack={vi.fn()} onQuiz={vi.fn()} onRead={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Hướng dẫn' })).toBeTruthy();
    expect(screen.getByText('Quan trọng').tagName).toBe('STRONG');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('x').closest('a')?.hasAttribute('href')).toBe(false);
    expect(screen.getAllByRole('link', { name: 'Mở video' })).toHaveLength(1);
  });

  it('uses English system controls without translating HR content', () => {
    render(<DayLearningView day={day} children={[{ ...lesson, videos: ['https://video.example/lesson'] }, question]}
      onBack={vi.fn()} onQuiz={vi.fn()} onRead={vi.fn()} />, 'en');
    expect(screen.getByRole('button', { name: 'Back to roadmap' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take quiz' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeTruthy();
    expect(screen.getByText('Nội dung')).toBeTruthy();
  });

  it('selects another assigned roadmap and exposes only pending metadata', async () => {
    const user = userEvent.setup();
    const options: MemberRoadmapOption[] = [
      { hireId: 'hire-2', positionName: 'QA', startDate: '2026-09-26', status: 'learning', doneDays: 0, totalDays: 2 },
      { hireId: 'hire-1', positionName: 'Engineer', startDate: '2026-09-24', status: 'done', doneDays: 2, totalDays: 2 },
    ];
    const makeLoaded = (hireId: string): LoadedLearning => ({
      hire: { id: hireId, employeeId: 'user-1', name: 'B', positionId: 'position-1',
        positionName: hireId === 'hire-2' ? 'QA' : 'Engineer', totalDays: 2, startDate: '2026-09-24',
        roadmapListId: 'run-1', status: 'learning', doneDays: 0, scores: {}, errorCode: null, pendingAction: null },
      roadmap: { overviewId: 'overview', templateListId: 'template', tree: { weeks: [{ id: 'week-1', name: 'Week 1', order: 0 }], items: [day, question] } },
      pendingSubmission: hireId === 'hire-2' ? { dayId: 'day-2', operationId: 'attempt-12345678', answeredQuestions: 1 } : null,
    });
    const load = vi.fn(async (hireId?: string) => makeLoaded(hireId ?? 'hire-2'));
    const resume = vi.fn(async () => ({ hire: { ...makeLoaded('hire-2').hire, scores: { '2': { first: '1/1', attempts: ['1/1'] } } },
      grade: { score: 1, total: 1, results: [{ itemId: 'question-1', correct: true, correctLabels: ['b'], explanation: 'Giải thích' }] }, attempt: 1 }));
    const learning = { listMine: vi.fn(async () => options), load, resume,
      markRead: vi.fn(), submit: vi.fn() };
    render(<EmployeeRoadmapScreen services={{ learning, ids: { next: () => 'attempt-next' } }} />, 'en');

    expect(await screen.findByRole('button', { name: 'Continue saving' })).toBeTruthy();
    expect(screen.queryByText('attempt-12345678')).toBeNull();
    const selector = screen.getByRole('combobox', { name: 'Onboarding roadmap' });
    expect((selector as HTMLSelectElement).value).toBe('hire-2');
    await user.selectOptions(selector, 'hire-1');
    expect(load).toHaveBeenLastCalledWith('hire-1');
    expect(await screen.findByText('Engineer')).toBeTruthy();
  });
});
