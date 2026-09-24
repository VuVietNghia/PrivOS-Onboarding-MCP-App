// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V4Onboarding } from '../../src/ui/onboarding/views/V4Onboarding';
import type { RoomBootstrap } from '../../src/ui/onboarding/data/room-bootstrap';

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn<() => Promise<RoomBootstrap>>(),
  hires: vi.fn(async () => ({ items: [], nextCursor: null })),
  positions: vi.fn(async () => ({ items: [], nextCursor: null })),
}));

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => appMock,
  usePrivosContext: () => ({ roomId: 'room-a', userId: 'admin-a', theme: 'light' }),
}));
const appMock = { storage: { get: async () => null, set: async () => undefined } };
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
    render(<V4Onboarding admin />);

    await user.click(screen.getByRole('button', { name: 'Templates', exact: true }));
    await screen.findByText('No matching positions.');
    await user.click(screen.getByRole('button', { name: 'Create template' }));
    expect(screen.getByRole('heading', { name: 'Tạo template onboarding' })).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Thêm ngày' })[0]);
    expect(screen.getByRole('button', { name: 'Thêm bài học' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Lưu nháp' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Sẵn sàng' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Quay lại danh sách' }));
    expect(screen.queryByRole('heading', { name: 'Tạo template onboarding' })).toBeNull();
    expect(mocks.positions).toHaveBeenCalled();
  });

  it('shows the real catalog surface after resolving the room binding', async () => {
    render(<V4Onboarding admin />);

    expect(await screen.findByText('No matching profiles.')).toBeTruthy();
    expect(screen.queryByText('Onboarding Lists are not configured for this room.')).toBeNull();
  });

  it('retains the selected hire and template filters while List setup is blocked', async () => {
    mocks.bootstrap.mockResolvedValue({ state: 'blocked', code: 'BOOTSTRAP_STAGE_UNAVAILABLE' });
    const user = userEvent.setup();
    render(<V4Onboarding admin />);
    await screen.findByText('PrivOS did not create the required List stages.');

    const hireStatus = screen.getByRole('combobox', { name: 'Filter by status' });
    await user.selectOptions(hireStatus, 'learning');
    expect((hireStatus as HTMLSelectElement).value).toBe('learning');
    await user.type(screen.getByRole('textbox', { name: 'Search people' }), 'An');
    expect((screen.getByRole('textbox', { name: 'Search people' }) as HTMLInputElement).value).toBe('An');
    expect(screen.getByRole('alert').textContent).toContain('PrivOS did not create the required List stages.');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect((hireStatus as HTMLSelectElement).value).toBe('all');

    await user.click(screen.getByRole('button', { name: 'Templates', exact: true }));
    const templateStatus = screen.getByRole('combobox', { name: 'Filter template status' });
    await user.selectOptions(templateStatus, 'ready');
    expect((templateStatus as HTMLSelectElement).value).toBe('ready');
    expect(mocks.hires).not.toHaveBeenCalled();
    expect(mocks.positions).not.toHaveBeenCalled();
  });

  it('queries the selected status when the room Lists are ready', async () => {
    const user = userEvent.setup();
    render(<V4Onboarding admin />);
    await screen.findByText('No matching profiles.');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'done');
    await waitFor(() => expect(mocks.hires).toHaveBeenLastCalledWith({ text: '', status: 'done' }, undefined));
    expect((screen.getByRole('button', { name: 'Create onboarding' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
