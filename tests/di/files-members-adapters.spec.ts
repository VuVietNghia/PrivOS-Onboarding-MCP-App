import { expect, it } from 'vitest';
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
