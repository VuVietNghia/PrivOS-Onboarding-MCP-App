// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PrivosOnboardingRoot, useOnboardingSession } from '../../src/ui/composition/PrivosOnboardingRoot';

const host = vi.hoisted(() => ({
  context: { roomId: 'room-a', userId: 'user', userRoles: ['admin'], effectiveScopes: ['lists:read'], roomType: 'c' },
  app: { storage: { get: async () => null, set: async () => {} } },
  pending: new Map<string, (value: unknown) => void>(),
  calls: new Map<string, number>(),
}));

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => host.app,
  usePrivosContext: () => host.context,
}));

vi.mock('../../src/ui/onboarding/data/room-bootstrap', () => ({
  resolveRoomBinding: (_deps: unknown, actor: { roomId: string }) => new Promise((resolve) => {
    host.calls.set(actor.roomId, (host.calls.get(actor.roomId) ?? 0) + 1);
    host.pending.set(actor.roomId, resolve);
  }),
}));

function Probe() {
  const session = useOnboardingSession();
  return <p>{session?.services ? `ready:${session.actor.roomId}` : `pending:${session?.actor.roomId ?? ''}`}</p>;
}

it('ignores an old room bootstrap after the actor switches rooms', async () => {
  host.context.roomId = 'room-a';
  const view = render(<PrivosOnboardingRoot><Probe /></PrivosOnboardingRoot>);
  await waitFor(() => expect(host.pending.has('room-a')).toBe(true));
  host.context.roomId = 'room-b';
  view.rerender(<PrivosOnboardingRoot><Probe /></PrivosOnboardingRoot>);
  await waitFor(() => expect(host.pending.has('room-b')).toBe(true));
  await act(async () => {
    host.pending.get('room-b')?.({ state: 'ready', binding: { roomId: 'room-b', positionsListId: 'positions', hiresListId: 'hires' } });
  });
  expect(screen.getByText('ready:room-b')).toBeTruthy();
  await act(async () => {
    host.pending.get('room-a')?.({ state: 'ready', binding: { roomId: 'room-a', positionsListId: 'positions', hiresListId: 'hires' } });
  });
  expect(screen.getByText('ready:room-b')).toBeTruthy();
  view.unmount();
});

it('shares one in-flight bootstrap through a StrictMode effect remount', async () => {
  host.context.roomId = 'strict-room';
  const view = render(<StrictMode><PrivosOnboardingRoot><Probe /></PrivosOnboardingRoot></StrictMode>);
  await waitFor(() => expect(host.pending.has('strict-room')).toBe(true));
  expect(host.calls.get('strict-room')).toBe(1);
  await act(async () => {
    host.pending.get('strict-room')?.({ state: 'ready', binding: { roomId: 'strict-room', positionsListId: 'positions', hiresListId: 'hires' } });
  });
  expect(screen.getByText('ready:strict-room')).toBeTruthy();
  view.unmount();
});

it('keeps bootstrap requests isolated between separate composition roots', async () => {
  host.context.roomId = 'isolated-room';
  const first = render(<PrivosOnboardingRoot><Probe /></PrivosOnboardingRoot>);
  const second = render(<PrivosOnboardingRoot><Probe /></PrivosOnboardingRoot>);
  await waitFor(() => expect(host.calls.get('isolated-room')).toBe(2));
  first.unmount();
  second.unmount();
});
