import { expect, it, vi } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { fakeRestApp, ok } from '../onboarding/fake-app';
import { createPrivosFiles } from '../../src/ui/onboarding/data/privos/files-adapter';
import { createPrivosMembers } from '../../src/ui/onboarding/data/privos/members-adapter';

it('resolves current file metadata separately for each open', async () => {
  let version = 0;
  const app = { callServerTool: async () => ({ file: {
    _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'folder-1',
    downloadUrl: `https://files.example/${++version}`,
  } }) } as unknown as McpApp;
  const seen: string[] = [];
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { async open(resolve) { seen.push((await resolve()).url); } },
    scheduler: { after: () => () => {} },
    lifetime: { assertActive() {}, dispose() {} },
  });
  await gateway.open('file-1', 'view');
  await gateway.open('file-1', 'view');
  expect(seen).toEqual(['https://files.example/1', 'https://files.example/2']);
});

it('rejects a non-HTTPS file URL before opening a browser link', async () => {
  const app = { callServerTool: async () => ({ file: {
    _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'folder-1', downloadUrl: 'http://files.example/old',
  } }) } as unknown as McpApp;
  const open = vi.fn(async (resolve: () => Promise<{ url: string; name: string }>) => { await resolve(); });
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { open }, scheduler: { after: () => () => {} }, lifetime: { assertActive() {}, dispose() {} },
  });
  await expect(gateway.open('file-1', 'view')).rejects.toThrow('FILE_UNAVAILABLE');
  expect(open).toHaveBeenCalledOnce();
});

it('uses the bound room identity for member lookup', async () => {
  const { app, calls } = fakeRestApp([{
    method: 'GET', path: 'channels.members',
    reply: () => ok({ data: { members: [{ _id: 'u1', name: 'An' }], offset: 0, total: 1 } }),
  }]);
  const gateway = createPrivosMembers(app, {
    roomId: 'room-1', roomType: 'c', userId: 'admin-1', roles: ['admin'], grantedScopes: ['rooms:read'],
  }, { assertActive() {}, dispose() {} });
  await expect(gateway.list()).resolves.toEqual([{ id: 'u1', username: 'u1', name: 'An' }]);
  expect(calls[0].query?.roomId).toBe('room-1');
});

it('recovers the private room route when the actor lacks roomType', async () => {
  const { app, calls } = fakeRestApp([{
    method: 'GET', path: 'groups.members',
    reply: () => ok({ data: { members: [{ _id: 'u1', username: 'an', name: 'An' }], offset: 0, total: 1 } }),
  }]);
  const contextCall = vi.spyOn(app, 'callServerTool').mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'p' }) }],
  });
  const gateway = createPrivosMembers(app, {
    roomId: 'R1', roomType: 'unsupported', userId: 'admin-1', roles: ['admin'], grantedScopes: ['rooms:read'],
  }, { assertActive() {}, dispose() {} });
  await expect(gateway.list()).resolves.toEqual([{ id: 'u1', username: 'an', name: 'An' }]);
  expect(contextCall).toHaveBeenCalledTimes(1);
  expect(calls.map(({ path }) => path)).toEqual(['groups.members']);
  expect(calls[0].query?.roomId).toBe('R1');
});
