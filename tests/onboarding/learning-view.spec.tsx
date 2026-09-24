// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Day, Hire, Lesson, Question, Roadmap } from '../../src/ui/onboarding/domain/models';
import { WeekRoadmap } from '../../src/ui/onboarding/views/learning/WeekRoadmap';
import { DayLearningView } from '../../src/ui/onboarding/views/learning/DayLearningView';

afterEach(cleanup);

const day: Day = { id: 'day-2', kind: 'day', name: 'Ngày 2', stageId: 'week-1', order: 2, parentId: null, content: 'Mục tiêu' };
const lesson: Lesson = { id: 'lesson-1', kind: 'lesson', name: 'Bài đọc', stageId: 'week-1', order: 0, parentId: 'day-2', content: 'Nội dung', attachments: [], videos: [], read: false };
const question: Question = { id: 'question-1', kind: 'question', name: 'Câu 1', stageId: 'week-1', order: 0, parentId: 'day-2', content: 'Chọn đáp án', options: ['A', 'B'], correctLabels: ['b'], explanation: 'Giải thích', selectedLabels: [], correct: null };

describe('employee learning views', () => {
  it('uses the hire snapshot and lets employees open every day', async () => {
    const user = userEvent.setup();
    const hire: Hire = { id: 'hire-1', employeeId: 'user-1', name: 'B', positionId: 'position-1', positionName: 'Kỹ sư', totalDays: 2,
      startDate: '2026-09-24', roadmapListId: 'run-1', status: 'learning', doneDays: 0, scores: {}, errorCode: null, pendingAction: null };
    const roadmap: Roadmap = { overviewId: 'overview-1', templateListId: 'template-1', tree: { weeks: [{ id: 'week-1', name: 'Tuần 1', order: 0 }], items: [day, lesson, question] } };
    const onDay = vi.fn();
    render(<WeekRoadmap roadmap={roadmap} hire={hire} onDay={onDay} />);
    expect(screen.getByText('Kỹ sư')).toBeTruthy();
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
});
