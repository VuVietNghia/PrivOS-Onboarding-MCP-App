// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpApp, RestResponse } from '@privos_ai/app-react';
import type { Catalogs } from '../../src/ui/onboarding/data/catalogs';
import { ProvisionV4Form as PureProvisionV4Form } from '../../src/ui/onboarding/views/ProvisionV4Form';
import { listRoomMembers, lookupUser } from '../../src/ui/onboarding/data/room-members';
import { templateFingerprint } from '../../src/ui/onboarding/flows/provision-v4';
import { createBrowserEffects } from '../../src/ui/adapters/browser-effects';
import { provisionV4, resumeV4, recountPositionV4 } from '../../src/ui/onboarding/data/privos/compat-flows';
import type { RoomBinding } from '../../src/ui/onboarding/domain/models';
import type { OnboardingServices } from '../../src/ui/onboarding/ports/ui-services';
import { fakeRestApp, forbidden, ok, type FakeRoute } from './fake-app';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const catalogs: Catalogs = {
  positions: async () => ({ items: [], nextCursor: null }),
  hires: async () => ({ items: [], nextCursor: null }),
  position: async () => { throw new Error('unused'); },
  hire: async () => { throw new Error('unused'); },
  template: async () => { throw new Error('unused'); },
  roadmap: async () => { throw new Error('unused'); },
};

function ProvisionV4Form(props: { app: McpApp; roomType: unknown; binding: RoomBinding; catalogs: Catalogs;
  actorRoles: readonly string[]; services?: Pick<OnboardingServices, 'provision' | 'members' | 'clock' | 'ids'>; onDone: () => void }) {
  const fallback = useMemo((): Pick<OnboardingServices, 'provision' | 'members' | 'clock' | 'ids'> => ({
    members: { list: () => listRoomMembers(props.app, props.binding.roomId, props.roomType),
      lookup: (value) => lookupUser(props.app, value) },
    provision: { start: (prepared, onProgress) => provisionV4(props.app, props.binding, prepared, props.actorRoles, onProgress, props.catalogs),
      resume: (hireId, prepared, onProgress) => resumeV4(props.app, props.binding, hireId, prepared, props.actorRoles, onProgress, props.catalogs),
      recount: (positionId) => recountPositionV4(props.app, props.binding, positionId),
      fingerprint: (tree) => templateFingerprint(tree, createBrowserEffects().hasher),
      operationId: async () => { throw new Error('UNEXPECTED_OPERATION_ID'); } },
    clock: { now: () => new Date() }, ids: { next: () => crypto.randomUUID() },
  }), [props.app, props.binding.roomId, props.roomType, props.catalogs, props.actorRoles]);
  return <PureProvisionV4Form binding={props.binding} catalogs={props.catalogs} services={props.services ?? fallback} onDone={props.onDone} />;
}

function renderOwnerLookup(routes: FakeRoute[]) {
  const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => forbidden() }, ...routes]);
  const position = { id: 'P1', name: 'Engineer', templateListId: 'T1', status: 'ready' as const,
    weeks: 1, days: 1, lessons: 0, questions: 0, missingAnswers: 0, inUse: 0 };
  const tree = { weeks: [{ id: 'w1', name: 'Tuần 1', order: 0 }], items: [] };
  const readyCatalogs: Catalogs = { ...catalogs,
    positions: async () => ({ items: [position], nextCursor: null }),
    position: async () => position,
    template: async () => tree,
  };
  const start = vi.fn(async () => ({ state: 'active' as const, hireId: 'H1', roadmapListId: 'RUN1' }));
  const onDone = vi.fn();
  const services: Pick<OnboardingServices, 'provision' | 'members' | 'clock' | 'ids'> = {
    members: { list: () => listRoomMembers(app, 'R1', 'p'), lookup: (value) => lookupUser(app, value) },
    provision: { start, resume: async () => { throw new Error('UNEXPECTED_RESUME'); },
      recount: async () => 0, fingerprint: async () => 'hash', operationId: async () => 'operation-1' },
    clock: { now: () => new Date(2026, 8, 28, 9) }, ids: { next: () => 'operation-1' },
  };
  render(<PureProvisionV4Form binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
    catalogs={readyCatalogs} services={services} onDone={onDone} />);
  return { start, onDone };
}

async function submitOwnerLookup(value: string) {
  fireEvent.change(await screen.findByLabelText('Username hoặc user ID'), { target: { value } });
  fireEvent.change(await screen.findByLabelText('Vị trí'), { target: { value: 'P1' } });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Tạo onboarding' }));
}

describe('ProvisionV4Form', () => {
  it('owner nhập username thành viên khi rooms:read bị từ chối và tạo onboarding đúng user ID', async () => {
    const { start, onDone } = renderOwnerLookup([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'u9', username: 'mai', name: 'Mai' },
    }) }]);
    await submitOwnerLookup('mai');
    await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ employeeId: 'u9', employeeName: 'Mai', positionId: 'P1' }),
    }), expect.any(Function)));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('owner nhập user ID và users.info trả thông tin thành viên cấp ngoài', async () => {
    const { start } = renderOwnerLookup([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'user-123', username: 'mai', name: 'Mai' },
    }) }]);
    await submitOwnerLookup('user-123');
    await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ employeeId: 'user-123', employeeName: 'Mai' }),
    }), expect.any(Function)));
  });

  it('không tạo onboarding khi username không tồn tại', async () => {
    const { start } = renderOwnerLookup([{ method: 'GET', path: 'users.info', reply: () => ({
      statusCode: 400, body: { success: false, error: 'User not found.' },
    }) }]);
    await submitOwnerLookup('ghost');
    expect((await screen.findByRole('alert')).textContent).toContain('Không tìm thấy người dùng');
    expect(start).not.toHaveBeenCalled();
  });

  it('không tạo onboarding khi users.info trả ID khác ID đã nhập', async () => {
    const { start } = renderOwnerLookup([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'different-id', username: 'mai', name: 'Mai' },
    }) }]);
    await submitOwnerLookup('user-123');
    expect((await screen.findByRole('alert')).textContent).toContain('Có lỗi không xác định');
    expect(start).not.toHaveBeenCalled();
  });

  it('không tạo onboarding khi Hub lỗi trong lúc tra cứu', async () => {
    const { start } = renderOwnerLookup([{ method: 'GET', path: 'users.info', reply: () => ({
      statusCode: 500, body: { success: false, error: 'internal failure' },
    }) }]);
    await submitOwnerLookup('mai');
    expect((await screen.findByRole('alert')).textContent).toContain('Hub từ chối thao tác');
    expect(start).not.toHaveBeenCalled();
  });

  it('uses the injected local clock once and keeps an edited date after rerender', () => {
    const { app } = fakeRestApp([]);
    let today = new Date(2026, 8, 25, 23, 30);
    const services = {
      clock: { now: () => today }, ids: { next: () => 'operation-1' },
      members: { list: async () => [], lookup: async () => ({ kind: 'not-found' as const }) },
      provision: { start: async () => { throw new Error('UNEXPECTED_START'); },
        resume: async () => { throw new Error('UNEXPECTED_RESUME'); },
        recount: async () => 0, fingerprint: async () => 'hash', operationId: async () => 'operation-1' },
    };
    const props = { app, roomType: 'c', binding: { roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' },
      catalogs, actorRoles: [], services, onDone: () => {} };
    const view = render(<ProvisionV4Form {...props} />);
    const input = screen.getByLabelText('Ngày bắt đầu') as HTMLInputElement;
    expect(input.value).toBe('2026-09-25');
    fireEvent.change(input, { target: { value: '2026-09-28' } });
    today = new Date(2026, 8, 26, 0, 15);
    view.rerender(<ProvisionV4Form {...props} />);
    expect(input.value).toBe('2026-09-28');
  });
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
    expect(await screen.findByRole('option', { name: 'An (@an)' })).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('chặn tạo onboarding khi Hub trả 200 nhưng dữ liệu thành viên sai', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [], total: 0,
    }) }]);
    render(<ProvisionV4Form app={app} roomType="p" binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={catalogs} actorRoles={[]} onDone={() => {}} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Có lỗi không xác định');
    expect(screen.queryByLabelText('Username hoặc user ID')).toBeNull();
    expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('chấp nhận user ID nhập tay khi không có quyền tra cứu người dùng', async () => {
    const { app } = fakeRestApp([
      { method: 'GET', path: 'channels.members', reply: () => forbidden() },
      { method: 'GET', path: 'users.info', reply: () => forbidden() },
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
    const option = await screen.findByRole('option', { name: 'An (@an)' });
    expect((option as HTMLOptionElement).value).toBe('u1');
    expect(screen.queryByText('User ID: u1')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Nhân sự' }), { target: { value: 'u1' } });
    expect(screen.getByText('User ID: u1')).not.toBeNull();
    expect(screen.queryByLabelText('Username hoặc user ID')).toBeNull();
  });

  it('passes the selected member ID and name to provisioning', async () => {
    const { app } = fakeRestApp([]);
    const position = { id: 'P1', name: 'Engineer', templateListId: 'T1', status: 'ready' as const,
      weeks: 1, days: 1, lessons: 0, questions: 0, missingAnswers: 0, inUse: 0 };
    const tree = { weeks: [{ id: 'w1', name: 'Week 1', order: 0 }], items: [] };
    const readyCatalogs: Catalogs = { ...catalogs,
      positions: async () => ({ items: [position], nextCursor: null }),
      position: async () => position, template: async () => tree,
    };
    const start = vi.fn(async () => ({ state: 'active' as const, hireId: 'H1', roadmapListId: 'RUN1' }));
    const services: Pick<OnboardingServices, 'provision' | 'members' | 'clock' | 'ids'> = {
      members: { list: async () => [{ id: 'u1', username: 'an', name: 'An' }],
        lookup: async () => { throw new Error('UNEXPECTED_LOOKUP'); } },
      provision: { start, resume: async () => { throw new Error('UNEXPECTED_RESUME'); },
        recount: async () => 0, fingerprint: async () => 'hash', operationId: async () => 'operation-1' },
      clock: { now: () => new Date(2026, 8, 28, 9) }, ids: { next: () => 'operation-1' },
    };
    render(<ProvisionV4Form app={app} roomType="p" binding={{ roomId: 'R1', positionsListId: 'P1', hiresListId: 'H1' }}
      catalogs={readyCatalogs} services={services} actorRoles={[]} onDone={() => {}} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Nhân sự' }), { target: { value: 'u1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Vị trí' }), { target: { value: 'P1' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo onboarding' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo onboarding' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ employeeId: 'u1', employeeName: 'An' }),
    }), expect.any(Function)));
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
    expect(await screen.findByRole('option', { name: 'New (@new)' })).not.toBeNull();
    await act(async () => { finishOld(ok({
      data: { members: [{ _id: 'old', name: 'Old' }], offset: 0, total: 1 },
    })); });
    expect(screen.queryByRole('option', { name: 'Old (@old)' })).toBeNull();
  });

  it('does not preflight a previous-room employee with a retained manual username', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (request) => ok({
      data: { members: request.query?.roomId === 'R1'
        ? [{ _id: 'old', username: 'old', name: 'Old' }]
        : [{ _id: 'new', username: 'new', name: 'New' }], offset: 0, total: 1 },
    }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'd' }) }],
    });
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
    expect(await screen.findByRole('option', { name: 'Old (@old)' })).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Nhân sự' }), { target: { value: 'old' } });
    expect(screen.getByText('User ID: old')).not.toBeNull();
    view.rerender(<ProvisionV4Form {...props} roomType="c" binding={binding('R2')} />);
    expect(await screen.findByRole('option', { name: 'New (@new)' })).not.toBeNull();
    expect(screen.queryByText('User ID: old')).toBeNull();
    expect((screen.getByRole('combobox', { name: 'Nhân sự' }) as HTMLSelectElement).value).toBe('');
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
