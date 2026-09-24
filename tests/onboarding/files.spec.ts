import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { createFilesGateway } from '../../src/ui/onboarding/data/files';

type Call = { name: string; arguments: Record<string, unknown> };

describe('FilesGateway', () => {
  it('uploads into verified position folder and keeps full upload object', async () => {
    const calls: Call[] = [];
    const uploadCalls: Record<string, unknown>[] = [];
    const raw = { _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'child', file_size: 4 };
    const app = { callServerTool: async (call: Call) => {
      calls.push(call);
      if (call.name === 'mcpapp.folders.getByChannel') return { folders: call.arguments.parentId
        ? [{ _id: 'child', name: 'position-a', father: 'root', channel_id: 'room-1' }]
        : [{ _id: 'root', name: 'Onboarding', father: null, channel_id: 'room-1' }] };
      if (call.name === 'mcpapp.files.get') return { file: raw };
      throw new Error('Unexpected tool');
    }, uploadFile: async (args: Record<string, unknown>) => { uploadCalls.push(args); return { success: true, file: raw }; } } as McpApp;
    const gateway = createFilesGateway(app, 'room-1');
    const result = await gateway.upload('position-a', new File(['data'], 'guide.pdf', { type: 'application/pdf' }));
    expect(uploadCalls[0]).toMatchObject({ channelId: 'room-1', folderId: 'child', fileName: 'guide.pdf', duplicateAction: 'keep_both' });
    expect(result).toMatchObject({ id: 'file-1', roomId: 'room-1', folderId: 'child', raw });
    expect(calls.at(-1)).toEqual({ name: 'mcpapp.files.get', arguments: { fileId: 'file-1' } });
  });

  it('refuses a metadata room mismatch after upload', async () => {
    const app = { callServerTool: async (call: Call) => call.name === 'mcpapp.folders.getByChannel'
      ? { folders: call.arguments.parentId
        ? [{ _id: 'child', name: 'position-a', father: 'root', channel_id: 'room-1' }]
        : [{ _id: 'root', name: 'Onboarding', father: null, channel_id: 'room-1' }] }
      : { file: { _id: 'file-1', channel_id: 'room-2', folder_id: 'child' } },
    uploadFile: async () => ({ file: { _id: 'file-1', name: 'guide.pdf' } }) } as McpApp;
    await expect(createFilesGateway(app, 'room-1').upload('position-a', new File(['x'], 'guide.pdf'))).rejects.toThrow('FILE_LOCATION_INVALID');
  });

  it('reads current metadata for each access and rejects wrong-room files', async () => {
    let count = 0;
    const app = { callServerTool: async () => { count += 1; return { file: { _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'child', downloadUrl: `https://example.test/${count}` } }; } } as McpApp;
    const gateway = createFilesGateway(app, 'room-1');
    expect((await gateway.metadata('file-1')).downloadUrl).toBe('https://example.test/1');
    expect((await gateway.metadata('file-1')).downloadUrl).toBe('https://example.test/2');
    expect(count).toBe(2);
  });

  it('does not move a file without public item ownership proof', async () => {
    const calls: Call[] = [];
    const app = { callServerTool: async (call: Call) => {
      calls.push(call);
      return { file: { _id: 'file-1', channel_id: 'room-1', folder_id: 'source-folder' } };
    } } as McpApp;
    await expect(createFilesGateway(app, 'room-1').move('file-1', 'destination-folder')).rejects.toThrow('FILE_LOCATION_UNVERIFIED');
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.files.get']);
  });

  it('moves only when source item proof matches and destination is under Onboarding', async () => {
    const calls: Call[] = [];
    let fileFolder = 'source-folder';
    const app = { callServerTool: async (call: Call) => {
      calls.push(call);
      if (call.name === 'mcpapp.files.get') return { file: { _id: 'file-1', channel_id: 'room-1', folder_id: fileFolder, itemId: 'lesson-1' } };
      if (call.name === 'mcpapp.folders.getByChannel') return { folders: call.arguments.parentId
        ? [{ _id: 'destination-folder', name: 'position-a', father: 'root', channel_id: 'room-1' }]
        : [{ _id: 'root', name: 'Onboarding', father: null, channel_id: 'room-1' }] };
      if (call.name === 'mcpapp.files.update') { fileFolder = 'destination-folder'; return { success: true }; }
      throw new Error('Unexpected tool');
    } } as McpApp;
    await createFilesGateway(app, 'room-1').move('file-1', 'destination-folder', 'lesson-1');
    expect(calls.map((call) => call.name)).toEqual([
      'mcpapp.files.get', 'mcpapp.folders.getByChannel', 'mcpapp.folders.getByChannel', 'mcpapp.files.update', 'mcpapp.files.get',
    ]);
  });
});
