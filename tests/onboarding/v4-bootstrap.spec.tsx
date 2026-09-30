// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V4Onboarding } from '../../src/ui/onboarding/views/V4Onboarding';
import { PrivosOnboardingRoot } from '../../src/ui/composition/PrivosOnboardingRoot';
import type { RoomBootstrap } from '../../src/ui/onboarding/data/room-bootstrap';
import type { Hire, Page, Position } from '../../src/ui/onboarding/domain/models';
import { OnboardingI18nProvider } from '../../src/ui/i18n/OnboardingI18nProvider';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn<() => Promise<RoomBootstrap>>(),
  hires: vi.fn(async (): Promise<Page<Hire>> => ({ items: [], nextCursor: null })),
  positions: vi.fn(async (): Promise<Page<Position>> => ({ items: [], nextCursor: null })),
}));

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => appMock,
  usePrivosContext: () => ({ roomId: 'room-a', userId: 'admin-a', theme: 'light' }),
}));
const appMock = { storage: { get: async () => null, set: async () => undefined } };
const renderV4 = () => render(
  <OnboardingI18nProvider userId="admin-a" preferences={appMock.storage} browserLocale="en">
    <PrivosOnboardingRoot><V4Onboarding admin /></PrivosOnboardingRoot>
  </OnboardingI18nProvider>,
);
vi.mock('../../src/ui/onboarding/data/room-bootstrap', () => ({
  resolveRoomBinding: mocks.bootstrap,
}));
vi.mock('../../src/ui/onboarding/data/catalogs', () => ({
  createCatalogs: () => ({
    positions: mocks.positions,
    hires: mocks.hires,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.bootstrap.mockResolvedValue({ state: 'ready', binding: { roomId: 'room-a', positionsListId: 'positions-a', hiresListId: 'hires-a' } });
});

describe('v4 room bootstrap surface', () => {
  it('opens the live P2 editor when room Lists are ready', async () => {
    const user = userEvent.setup();
    renderV4();

    await user.click(screen.getByRole('button', { name: /^Templates$/ }));
    await screen.findByText('No matching positions.');
    await user.click(screen.getByRole('button', { name: 'Create template' }));
    expect(screen.getByRole('heading', { name: 'Create onboarding template' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Add day' })[0]);
    expect(screen.getByRole('button', { name: 'Add lesson' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save draft' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Mark ready' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(screen.queryByRole('heading', { name: 'Create onboarding template' })).toBeNull();
    expect(mocks.positions).toHaveBeenCalled();
  });

  it('shows the real catalog surface after resolving the room binding', async () => {
    renderV4();

    expect(await screen.findByText('No matching profiles.')).toBeTruthy();
    expect(screen.queryByText('Onboarding Lists are not configured for this room.')).toBeNull();
  });

  it('retains the selected hire and template filters while List setup is blocked', async () => {
    mocks.bootstrap.mockResolvedValue({ state: 'blocked', code: 'BOOTSTRAP_STAGE_UNAVAILABLE' });
    const user = userEvent.setup();
    renderV4();
    await screen.findByText('PrivOS did not create the required list stages.');

    const hireStatus = screen.getByRole('combobox', { name: 'Filter by status' });
    await user.selectOptions(hireStatus, 'learning');
    expect((hireStatus as HTMLSelectElement).value).toBe('learning');
    await user.type(screen.getByRole('textbox', { name: 'Search people' }), 'An');
    expect((screen.getByRole('textbox', { name: 'Search people' }) as HTMLInputElement).value).toBe('An');
    expect(screen.getByRole('alert').textContent).toContain('PrivOS did not create the required list stages.');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect((hireStatus as HTMLSelectElement).value).toBe('all');

    await user.click(screen.getByRole('button', { name: /^Templates$/ }));
    const templateStatus = screen.getByRole('combobox', { name: 'Filter template status' });
    await user.selectOptions(templateStatus, 'ready');
    expect((templateStatus as HTMLSelectElement).value).toBe('ready');
    expect(mocks.hires).not.toHaveBeenCalled();
    expect(mocks.positions).not.toHaveBeenCalled();
  });

  it('queries the selected status when the room Lists are ready', async () => {
    const user = userEvent.setup();
    renderV4();
    await screen.findByText('No matching profiles.');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'done');
    await waitFor(() => expect(mocks.hires).toHaveBeenLastCalledWith({ text: '', status: 'done' }, undefined));
    expect((screen.getByRole('button', { name: 'Create onboarding' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps every status count visible after filtering the hire list', async () => {
    const learningHire: Hire = { id: 'h-learning', employeeId: 'u-learning', name: 'Learning hire', positionId: 'p1', positionName: 'Engineering', totalDays: 5, startDate: '2026-09-30', roadmapListId: 'r-learning', status: 'learning', doneDays: 1, scores: {}, errorCode: null, pendingAction: null };
    const completedHireOne: Hire = { ...learningHire, id: 'h-done-1', employeeId: 'u-done-1', name: 'Completed hire one', roadmapListId: 'r-done-1', status: 'done', doneDays: 5 };
    const completedHireTwo: Hire = { ...learningHire, id: 'h-done-2', employeeId: 'u-done-2', name: 'Completed hire two', roadmapListId: 'r-done-2', status: 'done', doneDays: 5 };
    mocks.hires
      .mockResolvedValueOnce({ items: [learningHire, completedHireOne, completedHireTwo], nextCursor: null })
      .mockResolvedValueOnce({ items: [learningHire], nextCursor: null });
    const user = userEvent.setup();
    renderV4();

    expect(await screen.findByRole('button', { name: /Completed 2/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Onboarding 1/ }));
    await waitFor(() => expect(mocks.hires).toHaveBeenLastCalledWith({ text: '', status: 'learning' }, undefined));
    expect(screen.getByRole('button', { name: /Completed 2/ })).toBeTruthy();
  });

  it('keeps loaded position options visible while navigating with arrow keys', async () => {
    mocks.positions.mockResolvedValue({ items: [{ id: 'p1', name: 'Engineering', templateListId: 't1', status: 'ready', weeks: 1, days: 1, lessons: 1, questions: 0, missingAnswers: 0, inUse: 0 }], nextCursor: null });
    const user = userEvent.setup();
    renderV4();
    await screen.findByText('No matching profiles.');
    const input = screen.getByRole('combobox', { name: 'Filter by position' });
    await user.click(input);
    expect(await screen.findByRole('option', { name: 'Engineering' })).toBeTruthy();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Engineering' })).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
  });
});
