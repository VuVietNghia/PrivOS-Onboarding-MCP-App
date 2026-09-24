import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { ensurePositionFolder } from '../../src/ui/onboarding/data/room-folders';

type Call = { name: string; arguments: Record<string, unknown> };
const folder = (id: string, name: string, father: string | null = null, room = 'room-1') =>
  ({ _id: id, name, father, channel_id: room });

function fakeFolderApp(initial: ReturnType<typeof folder>[] = []) {
  const folders = [...initial];
  const calls: Call[] = [];
  const app = { callServerTool: async (call: Call) => {
    calls.push(call);
    if (call.name === 'mcpapp.folders.getByChannel') return { folders: folders.filter((entry) => entry.father === (call.arguments.parentId ?? null)) };
    if (call.name === 'mcpapp.folders.create') {
      const created = folder(`created-${folders.length + 1}`, String(call.arguments.name),
        typeof call.arguments.parentId === 'string' ? call.arguments.parentId : null);
      folders.push(created);
      return { folder: created };
    }
    throw new Error('Unexpected tool');
  } } as McpApp;
  return { app, calls, folders };
}

describe('ensurePositionFolder', () => {
  it('creates Onboarding and position child with readback in the current room', async () => {
    const { app, calls } = fakeFolderApp();
    expect(await ensurePositionFolder(app, 'room-1', 'position-a')).toEqual({
      rootFolderId: 'created-1', positionFolderId: 'created-2',
    });
    expect(calls.filter((call) => call.name === 'mcpapp.folders.create').map((call) => call.arguments)).toEqual([
      { channelId: 'room-1', name: 'Onboarding' },
      { channelId: 'room-1', name: 'position-a', parentId: 'created-1' },
    ]);
  });

  it('reuses existing exact path without creating folders', async () => {
    const { app, calls } = fakeFolderApp([folder('root', 'Onboarding'), folder('child', 'position-a', 'root')]);
    expect(await ensurePositionFolder(app, 'room-1', 'position-a')).toEqual({ rootFolderId: 'root', positionFolderId: 'child' });
    expect(calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('fails on duplicate exact children and wrong-room metadata', async () => {
    const duplicate = fakeFolderApp([folder('root', 'Onboarding'), folder('a', 'position-a', 'root'), folder('b', 'position-a', 'root')]);
    await expect(ensurePositionFolder(duplicate.app, 'room-1', 'position-a')).rejects.toThrow('FOLDER_CONFLICT');
    const wrongRoom = fakeFolderApp([folder('foreign', 'Onboarding', null, 'room-2')]);
    await expect(ensurePositionFolder(wrongRoom.app, 'room-1', 'position-a')).rejects.toThrow('FILE_LOCATION_INVALID');
    expect(wrongRoom.calls.some((call) => call.name === 'mcpapp.folders.create')).toBe(false);
  });

  it('does not create on listing error', async () => {
    const calls: Call[] = [];
    const app = { callServerTool: async (call: Call) => { calls.push(call); return { isError: true, content: [{ type: 'text', text: '{"statusCode":403}' }] }; } } as McpApp;
    await expect(ensurePositionFolder(app, 'room-1', 'position-a')).rejects.toThrow();
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.folders.getByChannel']);
  });
});
