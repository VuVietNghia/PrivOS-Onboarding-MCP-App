// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render as testingRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { FilesGateway } from '../../src/ui/onboarding/ports/files';
import type { LearningService, LoadedLearning, MemberRoadmapOption } from '../../src/ui/onboarding/ports/learning';
import type { Hire, Question, Roadmap } from '../../src/ui/onboarding/domain/models';
import { OnboardingError } from '../../src/ui/onboarding/domain/errors';
import { EmployeeRoadmapScreen } from '../../src/ui/onboarding/views/learning/EmployeeRoadmapScreen';
import { createUiI18n } from '../../src/ui/i18n/config';

function render(ui: ReactElement) {
  const i18n = createUiI18n('en');
  const Wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  return Object.assign(testingRender(ui, { wrapper: Wrapper }), { i18n });
}

afterEach(cleanup);

const option: MemberRoadmapOption = { hireId: 'hire-1', positionName: 'Engineer', startDate: '2026-09-24',
  status: 'learning', doneDays: 0, totalDays: 1 };
const question: Question = { id: 'q-1', kind: 'question', name: 'Question 1', stageId: 'week-1', order: 1,
  parentId: 'day-1', content: 'Choose B', options: ['A', 'B'], correctLabels: ['b'], explanation: 'B is correct',
  selectedLabels: [], correct: null };

function snapshot(positionName = 'Engineer'): LoadedLearning {
  const hire: Hire = { id: 'hire-1', employeeId: 'user-1', name: 'Member', positionId: 'position-1', positionName,
    totalDays: 1, startDate: '2026-09-24', roadmapListId: 'run-1', status: 'learning', doneDays: 0,
    scores: {}, errorCode: null, pendingAction: null };
  const roadmap: Roadmap = { overviewId: 'overview', templateListId: 'template', tree: {
    weeks: [{ id: 'week-1', name: 'Week 1', order: 0 }],
    items: [
      { id: 'day-1', kind: 'day', name: 'Day 1', stageId: 'week-1', order: 1, parentId: null, content: 'Goal' },
      { id: 'lesson-1', kind: 'lesson', name: 'Guide', stageId: 'week-1', order: 0, parentId: 'day-1', content: 'Read',
        attachments: [{ id: 'file-1', name: 'guide.pdf' }], videos: [], read: false },
      question,
    ],
  } };
  return { hire, roadmap, pendingSubmission: null };
}

function snapshotFor(hireId: string, positionName: string): LoadedLearning {
  const loaded = snapshot(positionName);
  return { ...loaded, hire: { ...loaded.hire, id: hireId, positionName } };
}

function withLessonRead(loaded: LoadedLearning): LoadedLearning {
  return { ...loaded, roadmap: { ...loaded.roadmap, tree: { ...loaded.roadmap.tree,
    items: loaded.roadmap.tree.items.map((item) => item.kind === 'lesson' ? { ...item, read: true } : item) } } };
}

function passedQuiz(loaded: LoadedLearning) {
  const scores = { '1': { first: '1/1', attempts: ['1/1'] } };
  const hire = { ...loaded.hire, doneDays: 1, scores };
  return { hire, grade: { score: 1, total: 1,
    results: [{ itemId: 'q-1', correct: true, correctLabels: ['b'], explanation: 'B is correct' }] }, attempt: 1 };
}

function learningService(initial = snapshot()): { service: LearningService; current: () => LoadedLearning } {
  let current = initial;
  const service: LearningService = {
    listMine: vi.fn(async () => [option]),
    load: vi.fn(async () => current),
    markRead: vi.fn(async (_hireId, lessonId) => {
      current = { ...current, roadmap: { ...current.roadmap, tree: { ...current.roadmap.tree,
        items: current.roadmap.tree.items.map((item) => item.id === lessonId && item.kind === 'lesson' ? { ...item, read: true } : item) } } };
      return current;
    }),
    submit: vi.fn(async () => {
      const scores = { '1': { first: '1/1', attempts: ['1/1'] } };
      current = { ...current, hire: { ...current.hire, status: 'done', doneDays: 1, scores } };
      return { hire: current.hire, grade: { score: 1, total: 1,
        results: [{ itemId: 'q-1', correct: true, correctLabels: ['b'], explanation: 'B is correct' }] }, attempt: 1 };
    }),
    resume: vi.fn(async () => { throw new Error('NO_PENDING'); }),
  };
  return { service, current: () => current };
}

function files(): { gateway: FilesGateway; content: ReturnType<typeof vi.fn> } {
  const open = vi.fn(async () => {});
  const content = vi.fn(async () => ({
    fileId: 'file-1', name: 'guide.pdf', mimeType: 'text/markdown', blob: new Blob(), text: '',
  }));
  return { content, gateway: { folder: vi.fn(async () => 'folder-1'), upload: vi.fn(), metadata: vi.fn(),
    content,
    download: vi.fn(async () => {}), open,
    move: vi.fn(async () => {}) } };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: (value) => resolvePromise?.(value) };
}

describe('employee roadmap screen integration', () => {
  it('runs load, lesson, attachment, quiz, result and refreshed progress', async () => {
    const user = userEvent.setup();
    const learning = learningService();
    const file = files();
    render(<EmployeeRoadmapScreen services={{ learning: learning.service, ids: { next: () => 'attempt-12345678' } }}
      filesGateway={file.gateway} />);

    await user.click(await screen.findByRole('button', { name: /Day 1/ }));
    await user.click(screen.getByRole('button', { name: 'Open guide.pdf' }));
    expect(file.content).toHaveBeenCalledWith('file-1');
    expect(await screen.findByRole('dialog', { name: 'Preview guide.pdf' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close preview' }));
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    await user.click(screen.getByRole('button', { name: 'Take quiz' }));
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(await screen.findByRole('heading', { name: 'Attempt result 1' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back to day' }));
    await user.click(screen.getByRole('button', { name: 'Back to roadmap' }));
    expect(await screen.findByText('100%')).toBeTruthy();
  });

  it('renders empty state and retries a safe loading error', async () => {
    const empty = learningService();
    empty.service.listMine = vi.fn(async () => []);
    const view = render(<EmployeeRoadmapScreen services={{ learning: empty.service, ids: { next: () => 'id' } }} />);
    expect(await screen.findByText('You do not have an onboarding roadmap in this room.')).toBeTruthy();

    const retry = learningService();
    retry.service.listMine = vi.fn()
      .mockRejectedValueOnce(new OnboardingError('HIRE_NOT_OWNED', 'private-hire-id'))
      .mockResolvedValueOnce([option]);
    view.rerender(<EmployeeRoadmapScreen services={{ learning: retry.service, ids: { next: () => 'id' } }} />);
    expect(await screen.findByText('Could not load the roadmap. Try again.')).toBeTruthy();
    expect(screen.queryByText('private-hire-id')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Engineer')).toBeTruthy();
  });

  it('ignores a previous session promise after services change', async () => {
    const oldPage = deferred<readonly MemberRoadmapOption[]>();
    const old = learningService(snapshot('Old roadmap'));
    old.service.listMine = vi.fn(() => oldPage.promise);
    const fresh = learningService(snapshot('New roadmap'));
    const view = render(<EmployeeRoadmapScreen services={{ learning: old.service, ids: { next: () => 'old' } }} />);

    view.rerender(<EmployeeRoadmapScreen services={{ learning: fresh.service, ids: { next: () => 'new' } }} />);
    expect(await screen.findByText('New roadmap')).toBeTruthy();
    oldPage.resolve([option]);
    await waitFor(() => expect(screen.queryByText('Old roadmap')).toBeNull());
  });

  it('keeps quiz answers when a lesson write resolves after quiz navigation', async () => {
    const user = userEvent.setup();
    const learning = learningService();
    const write = deferred<LoadedLearning>();
    learning.service.markRead = vi.fn(() => write.promise);
    render(<EmployeeRoadmapScreen services={{ learning: learning.service, ids: { next: () => 'attempt-12345678' } }} />);

    await user.click(await screen.findByRole('button', { name: /Day 1/ }));
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    await user.click(screen.getByRole('button', { name: 'Take quiz' }));
    const answer = screen.getByRole('radio', { name: 'B' });
    await user.click(answer);
    write.resolve(withLessonRead(learning.current()));

    await waitFor(() => expect(screen.getByRole<HTMLInputElement>('radio', { name: 'B' }).checked).toBe(true));
  });

  it('does not replace day navigation when a quiz submit resolves late', async () => {
    const user = userEvent.setup();
    const learning = learningService();
    const save = deferred<Awaited<ReturnType<LearningService['submit']>>>();
    learning.service.submit = vi.fn(() => save.promise);
    render(<EmployeeRoadmapScreen services={{ learning: learning.service, ids: { next: () => 'attempt-12345678' } }} />);

    await user.click(await screen.findByRole('button', { name: /Day 1/ }));
    await user.click(screen.getByRole('button', { name: 'Take quiz' }));
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    await user.click(screen.getByRole('button', { name: 'Back to day' }));
    save.resolve(passedQuiz(learning.current()));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Day 1' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Attempt result 1' })).toBeNull();
  });

  it('does not replace roadmap navigation when resume resolves late', async () => {
    const user = userEvent.setup();
    const pending = { ...snapshot(), pendingSubmission: {
      dayId: 'day-1', operationId: 'attempt-12345678', answeredQuestions: 1,
    } } satisfies LoadedLearning;
    const learning = learningService(pending);
    const save = deferred<Awaited<ReturnType<LearningService['resume']>>>();
    learning.service.resume = vi.fn(() => save.promise);
    render(<EmployeeRoadmapScreen services={{ learning: learning.service, ids: { next: () => 'unused' } }} />);

    await user.click(await screen.findByRole('button', { name: 'Continue saving' }));
    await user.click(screen.getByRole('button', { name: /Day 1/ }));
    save.resolve(passedQuiz(learning.current()));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Day 1' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Attempt result 1' })).toBeNull();
  });

  it('keeps the selected run and quiz answers when locale changes', async () => {
    const user = userEvent.setup();
    const olderOption: MemberRoadmapOption = { ...option, hireId: 'hire-2', positionName: 'Older roadmap', startDate: '2026-08-01' };
    const learning = learningService();
    learning.service.listMine = vi.fn(async () => [option, olderOption]);
    learning.service.load = vi.fn(async (hireId) => hireId === 'hire-2' ? snapshotFor('hire-2', 'Older roadmap') : snapshot());
    const services = { learning: learning.service, ids: { next: () => 'attempt-12345678' } };
    const view = render(<EmployeeRoadmapScreen services={services} />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Onboarding roadmap' }), 'hire-2');
    await user.click(await screen.findByRole('button', { name: /Day 1/ }));
    await user.click(screen.getByRole('button', { name: 'Take quiz' }));
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await act(async () => { await view.i18n.changeLanguage('vi'); });

    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'B' }).checked).toBe(true);
    expect(learning.service.listMine).toHaveBeenCalledTimes(1);
    expect(learning.service.load).toHaveBeenCalledTimes(2);
  });

  it('refreshes the selected run status after completion', async () => {
    const user = userEvent.setup();
    const olderOption: MemberRoadmapOption = { ...option, hireId: 'hire-2', positionName: 'Older roadmap' };
    const learning = learningService();
    learning.service.listMine = vi.fn(async () => [option, olderOption]);
    render(<EmployeeRoadmapScreen services={{ learning: learning.service, ids: { next: () => 'attempt-12345678' } }} />);

    await user.click(await screen.findByRole('button', { name: /Day 1/ }));
    await user.click(screen.getByRole('button', { name: 'Take quiz' }));
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    await user.click(await screen.findByRole('button', { name: 'Back to day' }));
    await user.click(screen.getByRole('button', { name: 'Back to roadmap' }));

    expect(screen.getByRole('option', { name: /Engineer.*Completed/ })).toBeTruthy();
  });

  it('reuses the operation id when refresh fails after a successful submit', async () => {
    const user = userEvent.setup();
    const initial = snapshot();
    const saved = passedQuiz(initial);
    const completed = { ...initial, hire: saved.hire };
    const learning = learningService(initial);
    learning.service.submit = vi.fn(async () => saved);
    learning.service.load = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error('REFRESH_FAILED'))
      .mockResolvedValueOnce(completed);
    const nextId = vi.fn(() => 'attempt-stable');
    render(<EmployeeRoadmapScreen services={{ learning: learning.service, ids: { next: nextId } }} />);

    await user.click(await screen.findByRole('button', { name: /Day 1/ }));
    await user.click(screen.getByRole('button', { name: 'Take quiz' }));
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save the answers. Try again.');
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));

    expect(await screen.findByRole('heading', { name: 'Attempt result 1' })).toBeTruthy();
    expect(nextId).toHaveBeenCalledTimes(1);
    expect(learning.service.submit).toHaveBeenCalledTimes(2);
    expect(learning.service.submit).toHaveBeenNthCalledWith(1, expect.objectContaining({ operationId: 'attempt-stable' }));
    expect(learning.service.submit).toHaveBeenNthCalledWith(2, expect.objectContaining({ operationId: 'attempt-stable' }));
  });
});
