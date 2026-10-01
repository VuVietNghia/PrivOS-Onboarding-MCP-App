import { expect, it, vi } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { fakeRestApp, ok } from '../onboarding/fake-app';
import { createPrivosFiles } from '../../src/ui/onboarding/data/privos/files-adapter';
import { createPrivosMembers } from '../../src/ui/onboarding/data/privos/members-adapter';

interface ExpectedFileContent {
  fileId: string;
  name: string;
  mimeType: string;
  blob: Blob;
  text: string | null;
}

interface FilesGatewayWithDownload {
  download(fileId: string): Promise<void>;
}

it('resolves current file metadata separately for each open', async () => {
  let version = 0;
  const app = { callServerTool: async () => ({ file: {
    _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'folder-1',
    downloadUrl: `https://files.example/${++version}`,
  } }) } as unknown as McpApp;
  const seen: string[] = [];
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { async open(resolve) { seen.push((await resolve()).url); }, save() {} },
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
    links: { open, save() {} }, scheduler: { after: () => () => {} }, lifetime: { assertActive() {}, dispose() {} },
  });
  await expect(gateway.open('file-1', 'view')).rejects.toThrow('FILE_UNAVAILABLE');
  expect(open).toHaveBeenCalledOnce();
});

it('reads file content through the authenticated Hub content endpoint', async () => {
  const app = {
    callServerTool: async () => ({ file: {
      _id: 'file-1', name: 'guide.md', channel_id: 'room-1', folder_id: 'folder-1',
      file_type: 'md', downloadUrl: 'http://10.88.255.1:9010/internal',
    } }),
    rest: vi.fn(async () => ({ statusCode: 200, body: '# Welcome' })),
  } as unknown as McpApp;
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { open: vi.fn(async () => {}), save() {} },
    scheduler: { after: () => () => {} },
    lifetime: { assertActive() {}, dispose() {} },
  });

  const content = await (gateway as FilesGatewayWithContent).content('file-1');

  expect(app.rest).toHaveBeenCalledWith({
    method: 'GET', path: 'file-management.files/file-1/content', timeoutMs: 20_000,
  });
  expect(content).toMatchObject({ fileId: 'file-1', name: 'guide.md', mimeType: 'text/markdown' });
  expect(content.text).toBe('# Welcome');
  expect(await content.blob.text()).toBe('# Welcome');
});

it('reads raw file content from the live PrivOS bridge envelope', async () => {
  const app = {
    callServerTool: async () => ({ file: {
      _id: 'file-1', name: 'guide.md', channel_id: 'room-1', folder_id: 'folder-1', file_type: 'md',
    } }),
    rest: vi.fn(async () => ({ result: '# Live bridge content' })),
  } as unknown as McpApp;
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { open: vi.fn(async () => {}), save() {} },
    scheduler: { after: () => () => {} },
    lifetime: { assertActive() {}, dispose() {} },
  });

  const content = await (gateway as FilesGatewayWithContent).content('file-1');

  expect(await content.blob.text()).toBe('# Live bridge content');
  expect(content.text).toBe('# Live bridge content');
});

interface FilesGatewayWithContent {
  content(fileId: string): Promise<ExpectedFileContent>;
}

it('downloads exact binary bytes from nested Hub envelope', async () => {
  const saved: { blob: Blob; name: string }[] = [];
  const app = {
    callServerTool: async () => ({ file: {
      _id: 'file-1', name: 'image.png', channel_id: 'room-1', folder_id: 'folder-1',
    } }),
    rest: async () => ({ statusCode: 200, body: { result: { dataBase64: 'AP+JUA==', size: 4, mimeType: 'image/png' } } }),
  } as unknown as McpApp;
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { async open() {}, save(blob, name) { saved.push({ blob, name }); } },
    scheduler: { after: () => () => {} }, lifetime: { assertActive() {}, dispose() {} },
  });
  await gateway.download('file-1');
  expect(saved).toHaveLength(1);
  expect(saved[0].name).toBe('image.png');
  expect(saved[0].blob.type).toBe('image/png');
  expect([...new Uint8Array(await saved[0].blob.arrayBuffer())]).toEqual([0, 255, 137, 80]);
});

it('downloads the authenticated Hub content as a named Blob', async () => {
  const save = vi.fn();
  const app = {
    callServerTool: async () => ({ file: {
      _id: 'file-1', name: 'guide.md', channel_id: 'room-1', folder_id: 'folder-1', file_type: 'md',
    } }),
    rest: vi.fn(async () => ({ statusCode: 200, body: '# Welcome' })),
  } as unknown as McpApp;
  const gateway = createPrivosFiles(app, 'room-1', {
    links: { open: vi.fn(async () => {}), save },
    scheduler: { after: () => () => {} },
    lifetime: { assertActive() {}, dispose() {} },
  });

  await (gateway as FilesGatewayWithDownload).download('file-1');

  expect(save).toHaveBeenCalledOnce();
  const [blob, name] = save.mock.calls[0] as unknown as [Blob, string];
  expect(name).toBe('guide.md');
  expect(blob.type).toBe('text/markdown');
  expect(await blob.text()).toBe('# Welcome');
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
