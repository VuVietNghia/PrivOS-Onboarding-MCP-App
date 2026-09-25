// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestResponse } from '@privos_ai/app-react';
import type { Catalogs } from '../../src/ui/onboarding/data/catalogs';
import { ProvisionV4Form } from '../../src/ui/onboarding/views/ProvisionV4Form';
import { fakeRestApp, forbidden, ok } from './fake-app';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const catalogs: Catalogs = {
  positions: async () => ({ items: [], nextCursor: null }),
  hires: async () => ({ items: [], nextCursor: null }),
  position: async () => { throw new Error('unused'); },
  hire: async () => { throw new Error('unused'); },
  template: async () => { throw new Error('unused'); },
  roadmap: async () => { throw new Error('unused'); },
};

describe('ProvisionV4Form', () => {
  it('defaults to local today and keeps a manually chosen date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 9));
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ({
      statusCode: 200, body: { success: true, data: { members: [], offset: 0, total: 0 } },
    }) }]);
    const props = { app, roomType: 'c', binding: { roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' },
      catalogs, actorRoles: [], onDone: () => {} };
    const view = render(<ProvisionV4Form {...props} />);
    const input = screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement;
    expect(input.value).toBe('2026-09-25');
    fireEvent.change(input, { target: { value: '2026-09-28' } });
    view.rerender(<ProvisionV4Form {...props} />);
    expect(input.value).toBe('2026-09-28');
  });

  it('shows a weekend default but disables creation after the other choices are ready', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 9));
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ({
      statusCode: 200, body: { success: true, data: { members: [{ _id: 'u1', name: 'An' }], offset: 0, total: 1 } },
    }) }]);
    const position = { id: 'P1', name: 'Engineer', templateListId: 'T1', status: 'ready' as const,
      weeks: 1, days: 1, lessons: 0, questions: 0, missingAnswers: 0, inUse: 0 };
    const readyCatalogs: Catalogs = { ...catalogs,
      positions: async () => ({ items: [position], nextCursor: null }),
      template: async () => ({ weeks: [{ id: 'w1', name: 'Week 1', order: 0 }], items: [] }),
    };
    render(<ProvisionV4Form app={app} roomType="c" binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={readyCatalogs} actorRoles={[]} onDone={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Nhân sự'), { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: 'P1' } });
    await act(async () => { await Promise.resolve(); });
    expect((screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement).value).toBe('2026-09-26');
    expect(screen.getByRole('alert').textContent).toContain('thứ 2 đến thứ 6');
    expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('recomputes today when the form opens again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 9));
    const { app } = fakeRestApp([]);
    const props = { app, roomType: 'c', binding: { roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' },
      catalogs, actorRoles: [], onDone: () => {} };
    const first = render(<ProvisionV4Form {...props} />);
    expect((screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement).value).toBe('2026-09-25');
    first.unmount();
    vi.setSystemTime(new Date(2026, 8, 28, 9));
    render(<ProvisionV4Form {...props} />);
    expect((screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement).value).toBe('2026-09-28');
  });

  it('hiện lỗi khi Hub không tải được thành viên thay vì âm thầm chuyển sang nhập tay', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (_req, callIndex) => callIndex === 0 ? ({
      statusCode: 500, body: { success: false, error: 'internal failure' },
    }) : ({ statusCode: 200, body: { success: true, data: { members: [{ _id: 'U1', username: 'an', name: 'An' }], offset: 0, total: 1 } } }) }]);
    render(<ProvisionV4Form app={app} roomType="c" binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={catalogs} actorRoles={[]} onDone={() => {}} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Hub từ chối thao tác');
    expect(screen.queryByLabelText('Username hoặc user ID')).toBeNull();
    expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại thành viên' }));
    expect(await screen.findByRole('option', { name: 'An' })).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('chấp nhận user ID nhập tay khi không có quyền tra cứu người dùng', async () => {
    const { app } = fakeRestApp([
      { method: 'GET', path: 'channels.members', reply: () => forbidden() },
      { method: 'GET', path: 'users.list', reply: () => forbidden() },
    ]);
    const position = { id: 'P1', name: 'Engineer', templateListId: 'T1', status: 'ready' as const,
      weeks: 1, days: 1, lessons: 1, questions: 0, missingAnswers: 0, inUse: 0 };
    const readPosition = vi.fn(async () => { throw new Error('STOP_AFTER_EMPLOYEE_ID'); });
    const withPosition: Catalogs = { ...catalogs,
      positions: async () => ({ items: [position], nextCursor: null }),
      position: readPosition,
      template: async () => ({ weeks: [{ id: 'w1', name: 'Tuần 1', order: 0 }], items: [] }),
    };
    render(<ProvisionV4Form app={app} roomType="c" binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={withPosition} actorRoles={[]} onDone={() => {}} />);
    fireEvent.change(await screen.findByLabelText('Username hoặc user ID'), { target: { value: 'user-123' } });
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: 'P1' } });
    fireEvent.change(screen.getByLabelText('Ngày bắt đầu'), { target: { value: '2026-09-28' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo onboarding' }));
    await waitFor(() => expect(readPosition).toHaveBeenCalledWith('P1'));
  });

  it('loads private-room members into the picker', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      data: { members: [{ _id: 'u1', username: 'an', name: 'An' }], offset: 0, total: 1 },
    }) }]);
    render(<ProvisionV4Form app={app} roomType="p"
      binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={catalogs} actorRoles={[]} onDone={() => {}} />);
    expect(await screen.findByRole('option', { name: 'An' })).not.toBeNull();
    expect(screen.queryByLabelText('Username hoặc user ID')).toBeNull();
  });

  it('uses manual input when the group route is denied', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => forbidden() }]);
    render(<ProvisionV4Form app={app} roomType="p"
      binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={catalogs} actorRoles={[]} onDone={() => {}} />);
    expect(await screen.findByLabelText('Username hoặc user ID')).not.toBeNull();
  });

  it('keeps an empty successful group list distinct from a denied route', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      data: { members: [], offset: 0, total: 0 },
    }) }]);
    render(<ProvisionV4Form app={app} roomType="p"
      binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={catalogs} actorRoles={[]} onDone={() => {}} />);
    expect(await screen.findByRole('combobox', { name: 'Nhân sự' })).not.toBeNull();
    expect(screen.queryByLabelText('Username hoặc user ID')).toBeNull();
  });

  it('ignores members returned for a previous room', async () => {
    let finishOld!: (value: RestResponse) => void;
    const oldResponse = new Promise<RestResponse>((resolve) => { finishOld = resolve; });
    const { app } = fakeRestApp([]);
    vi.spyOn(app, 'rest').mockImplementation(async (request) =>
      request.query?.roomId === 'R1' ? oldResponse : ok({
        data: { members: [{ _id: 'new', name: 'New' }], offset: 0, total: 1 },
      }));
    const props = { app, roomType: 'p', catalogs, actorRoles: [], onDone: () => {} };
    const view = render(<ProvisionV4Form {...props}
      binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }} />);
    view.rerender(<ProvisionV4Form {...props}
      binding={{ roomId: 'R2', positionsListId: 'P2', hiresListId: 'H2' }} />);
    expect(await screen.findByRole('option', { name: 'New' })).not.toBeNull();
    await act(async () => { finishOld(ok({
      data: { members: [{ _id: 'old', name: 'Old' }], offset: 0, total: 1 },
    })); });
    expect(screen.queryByRole('option', { name: 'Old' })).toBeNull();
  });

  it('does not preflight a previous-room employee with a retained manual username', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (request) => ok({
      data: { members: request.query?.roomId === 'R1'
        ? [{ _id: 'old', username: 'old', name: 'Old' }]
        : [{ _id: 'new', username: 'new', name: 'New' }], offset: 0, total: 1 },
    }) }]);
    const position = { id: 'P1', name: 'Engineer', templateListId: 'T1', status: 'ready' as const,
      weeks: 1, days: 1, lessons: 0, questions: 0, missingAnswers: 0, inUse: 0 };
    const readPosition = vi.fn(async () => { throw new Error('STALE_EMPLOYEE_REACHED_PREFLIGHT'); });
    const withPosition: Catalogs = { ...catalogs,
      positions: async () => ({ items: [position], nextCursor: null }),
      position: readPosition,
      template: async () => ({ weeks: [{ id: 'w1', name: 'Week 1', order: 0 }], items: [] }),
    };
    const props = { app, catalogs: withPosition, actorRoles: [], onDone: () => {} };
    const binding = (roomId: string) => ({ roomId, positionsListId: 'P1', hiresListId: 'H1' });
    const view = render(<ProvisionV4Form {...props} roomType={undefined} binding={binding('R1')} />);
    fireEvent.change(await screen.findByLabelText('Username hoặc user ID'), { target: { value: 'stale-manual-name' } });
    view.rerender(<ProvisionV4Form {...props} roomType="c" binding={binding('R1')} />);
    expect(await screen.findByRole('option', { name: 'Old' })).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Nhân sự' }), { target: { value: 'old' } });
    view.rerender(<ProvisionV4Form {...props} roomType="c" binding={binding('R2')} />);
    expect(await screen.findByRole('option', { name: 'New' })).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: 'P1' } });
    fireEvent.change(screen.getByLabelText('Ngày bắt đầu'), { target: { value: '2026-09-28' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Nhân sự' })).not.toBeNull());
    const form = screen.getByRole('button', { name: 'Tạo onboarding' }).closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    await screen.findByRole('alert');
    expect(readPosition).not.toHaveBeenCalled();
  });
});
