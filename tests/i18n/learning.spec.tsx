// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hire, Question, Roadmap } from '../../src/ui/onboarding/domain/models';
import type { LoadedLearning, LearningService, MemberRoadmapOption, SubmitQuizResult } from '../../src/ui/onboarding/ports/learning';
import { EmployeeRoadmapScreen } from '../../src/ui/onboarding/views/learning/EmployeeRoadmapScreen';
import { renderI18n } from '../helpers/render-i18n';

afterEach(cleanup);

const question: Question = {
  id: 'q1', kind: 'question', name: 'Câu hỏi 1', stageId: 'w1', order: 0, parentId: 'd1',
  content: 'Chọn đáp án đúng', options: ['Sai', 'Đúng'], correctLabels: ['b'], explanation: 'Vì B đúng',
  selectedLabels: [], correct: null,
};
const roadmap: Roadmap = {
  overviewId: 'overview', templateListId: 'template', tree: {
    weeks: [{ id: 'w1', name: 'Tuần chuyên môn', order: 0 }],
    items: [{ id: 'd1', kind: 'day', name: 'Ngày nghiệp vụ', stageId: 'w1', order: 1, parentId: null, content: 'Mục tiêu' }, question],
  },
};

function hire(id: string, positionName: string): Hire {
  return { id, employeeId: 'user-1', name: 'An', positionId: `position-${id}`, positionName, totalDays: 1,
    startDate: '2026-09-29', roadmapListId: `roadmap-${id}`, status: 'learning', doneDays: 0,
    scores: {}, errorCode: null, pendingAction: null };
}

function loaded(id = 'hire-1', positionName = 'Kỹ sư'): LoadedLearning {
  return { hire: hire(id, positionName), roadmap, pendingSubmission: null };
}

describe('member learning localization', () => {
  it('keeps answers and a single submission while locale changes', async () => {
    let finishSubmit: ((value: SubmitQuizResult) => void) | undefined;
    const pendingSubmit = new Promise<SubmitQuizResult>((resolve) => { finishSubmit = resolve; });
    const submit = vi.fn(() => pendingSubmit);
    const load = vi.fn(async () => loaded());
    const learning: LearningService = {
      listMine: async () => [{ hireId: 'hire-1', positionName: 'Kỹ sư', startDate: '2026-09-29', status: 'learning', doneDays: 0, totalDays: 1 }],
      load, markRead: async () => loaded(), submit, resume: async () => { throw new Error('UNEXPECTED_RESUME'); },
    };
    const view = renderI18n(<EmployeeRoadmapScreen services={{ learning, ids: { next: () => 'operation-1' } }} />);

    await view.user.click(await screen.findByRole('button', { name: /Ngày nghiệp vụ/ }));
    await view.user.click(screen.getByRole('button', { name: 'Làm quiz' }));
    const answer = screen.getByRole('radio', { name: 'Đúng' }) as HTMLInputElement;
    await view.user.click(answer);
    await view.user.click(screen.getByRole('button', { name: 'Nộp bài' }));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());

    await act(async () => { await view.i18n.changeLanguage('en'); });
    expect((screen.getByRole('radio', { name: 'Đúng' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
    expect(submit).toHaveBeenCalledWith({ hireId: 'hire-1', dayId: 'd1', operationId: 'operation-1', answers: { q1: ['b'] } });
    expect(submit).toHaveBeenCalledOnce();

    const savedHire = { ...hire('hire-1', 'Kỹ sư'), doneDays: 1, scores: { '1': { first: '1/1', attempts: ['1/1'] } } };
    await act(async () => { finishSubmit?.({ hire: savedHire, grade: { score: 1, total: 1, results: [
      { itemId: 'q1', correct: true, correctLabels: ['b'], explanation: 'Vì B đúng' },
    ] }, attempt: 1 }); await pendingSubmit; });
    expect(await screen.findByRole('heading', { name: 'Attempt result 1' })).toBeTruthy();
    expect(screen.getByText('1/1', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText(/First score: 1\/1/)).toBeTruthy();

    await act(async () => { await view.i18n.changeLanguage('vi'); });
    expect(screen.getByRole('heading', { name: 'Kết quả lần 1' })).toBeTruthy();
    expect(screen.getByText(/Điểm lần đầu: 1\/1/)).toBeTruthy();
    expect(submit).toHaveBeenCalledOnce();
  });

  it('keeps the selected roadmap and day without reloading on locale change', async () => {
    const options: MemberRoadmapOption[] = [
      { hireId: 'hire-1', positionName: 'Kỹ sư', startDate: '2026-09-29', status: 'learning', doneDays: 0, totalDays: 1 },
      { hireId: 'hire-2', positionName: 'QA', startDate: '2026-09-30', status: 'learning', doneDays: 0, totalDays: 1 },
    ];
    const load = vi.fn(async (hireId?: string) => loaded(hireId ?? 'hire-1', hireId === 'hire-2' ? 'QA' : 'Kỹ sư'));
    const learning: LearningService = {
      listMine: vi.fn(async () => options), load, markRead: async () => loaded(),
      submit: async () => { throw new Error('UNEXPECTED_SUBMIT'); }, resume: async () => { throw new Error('UNEXPECTED_RESUME'); },
    };
    const view = renderI18n(<EmployeeRoadmapScreen services={{ learning, ids: { next: () => 'operation-1' } }} />);
    const selector = await screen.findByRole('combobox', { name: 'Lộ trình onboarding' });
    await view.user.selectOptions(selector, 'hire-2');
    await screen.findByText('QA');
    await view.user.click(screen.getByRole('button', { name: /Ngày nghiệp vụ/ }));
    const callsBeforeLocale = load.mock.calls.length;

    await act(async () => { await view.i18n.changeLanguage('en'); });
    expect(screen.getByRole('heading', { name: 'Ngày nghiệp vụ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to roadmap' })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(callsBeforeLocale);
  });
});
