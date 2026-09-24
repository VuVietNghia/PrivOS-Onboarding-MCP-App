import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { registryListInput } from '../../src/ui/onboarding/domain/v2-registry-schema';
import { createItem, createList } from '../../src/ui/onboarding/data/onboarding-lists';
import { aclQuery, aclUpdate, classifyAclResult, createFolderRequest, moveFileRequest, fileLocation, uploadFileParams, actorAllowed, queryMatches, updateMatches, folderMatches, fileMatches, ordinaryField, itemFolderMatches, assigneeIncludes, hiddenTargetVerdict, uploadResultId, createVerifiedFolder, createRegistryIfVacant } from '../../src/ui/onboarding/dev/p0-contracts';
import { probeSafetyReducer } from '../../src/ui/onboarding/dev/probe-safety';
import { fakeRestApp, ok } from './fake-app';

describe('v2 registry bootstrap', () => {
  it('uses exact keys, ordered stages and fields for both isolated registries', () => {
    const positions = registryListInput('room-1', 'positions');
    expect(positions.key).toBe('onb-positions');
    expect(positions.isolated).toBe(true);
    expect(positions.stages.map(({ name, order }) => ({ name, order }))).toEqual(['Đang soạn', 'Sẵn sàng', 'Ngừng dùng'].map((name, order) => ({ name, order })));
    expect(positions.stages.every((stage) => /^#[0-9a-f]{6}$/i.test(stage.color))).toBe(true);
    expect(positions.fields).toEqual([
      ['Template', 'TEXT'], ['Số tuần', 'NUMBER'], ['Số ngày', 'NUMBER'], ['Số bài học', 'NUMBER'],
      ['Số câu hỏi', 'NUMBER'], ['Thiếu đáp án', 'NUMBER'], ['Đang dùng', 'NUMBER'], ['Nguồn nhập', 'TEXT'],
    ].map(([name, type]) => ({ name, type })));
    const hires = registryListInput('room-1', 'hires');
    expect(hires.key).toBe('onb-hires');
    expect(hires.isolated).toBe(true);
    expect(hires.stages.map(({ name, order }) => ({ name, order }))).toEqual(['Đang khởi tạo', 'Đang học', 'Hoàn tất', 'Khởi tạo lỗi', 'Đã huỷ'].map((name, order) => ({ name, order })));
    expect(hires.fields).toEqual([
      ['Nhân sự', 'ASSIGNEE'], ['Vị trí', 'TEXT'], ['Ngày bắt đầu', 'DATE'], ['Lộ trình', 'TEXT'],
      ['Số ngày đã xong', 'NUMBER'], ['Điểm', 'TEXTAREA'], ['Mã lỗi', 'TEXT'], ['Tên vị trí', 'TEXT'],
      ['Tổng ngày', 'NUMBER'], ['Khởi tạo', 'TEXTAREA'], ['Lần nộp đang xử lý', 'TEXTAREA'],
      ['Mã lần nộp cuối', 'TEXT'], ['Thao tác đang chạy', 'TEXT'],
    ].map(([name, type]) => ({ name, type })));
  });

  it('sends the v2 spec through the MCP List tool', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'POST', path: 'lists.create', reply: () => ok({ list: { _id: 'positions-1', name: 'Onboarding positions', key: 'onb-positions' } }) }]);
    await createList(app, registryListInput('room-1', 'positions'));
    expect(toolCalls[0]).toEqual({ name: 'mcpapp.lists.create', arguments: {
      roomId: 'room-1', name: 'Onboarding positions', key: 'onb-positions', isolatedList: true, crossTeamWorkflow: false,
      fieldDefinitions: [
        ['Template', 'TEXT'], ['Số tuần', 'NUMBER'], ['Số ngày', 'NUMBER'], ['Số bài học', 'NUMBER'],
        ['Số câu hỏi', 'NUMBER'], ['Thiếu đáp án', 'NUMBER'], ['Đang dùng', 'NUMBER'], ['Nguồn nhập', 'TEXT'],
      ].map(([name, type]) => ({ name, type })),
      stages: [{ name: 'Đang soạn', color: '#64748b' }, { name: 'Sẵn sàng', color: '#2563eb' }, { name: 'Ngừng dùng', color: '#16a34a' }],
    } });
  });

  it('stops before POST when the room already has the v1 hires key', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists: [{ _id: 'old-hire-list', key: 'onb-hires', name: 'v1 hires' }] }) }]);
    expect(await createRegistryIfVacant(app, 'room-1', 'hires')).toEqual({ status: 'collision' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET', path: 'lists.listByRoomId', query: { roomId: 'room-1' } });
  });

  it('accepts the Hub list envelope when success is omitted', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ({
      statusCode: 200, body: { lists: [{ _id: 'existing', key: 'onb-hires', name: 'v1 hires' }] },
    }) }]);
    expect(await createRegistryIfVacant(app, 'room-1', 'hires')).toEqual({ status: 'collision' });
    expect(calls).toHaveLength(1);
  });

  it('accepts an MCP List array without a success envelope', async () => {
    const calls: string[] = [];
    const app = { callServerTool: async (call: { name: string }) => { calls.push(call.name); return [{ id: 'existing', key: 'onb-hires', name: 'v1 hires' }]; } } as McpApp;
    expect(await createRegistryIfVacant(app, 'room-1', 'hires')).toEqual({ status: 'collision' });
    expect(calls).toEqual(['mcpapp.lists.getAll']);
  });

  it('stops when PrivOS rewrites the registry key but keeps its exact name', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({
      lists: [{ _id: 'existing', key: 'OP', name: 'Onboarding positions' }],
    }) }]);
    expect(await createRegistryIfVacant(app, 'room-1', 'positions')).toEqual({ status: 'collision' });
    expect(calls).toHaveLength(1);
  });

  it('creates only after a valid empty room-key preflight', async () => {
    const { app, calls } = fakeRestApp([
      { method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists: [] }) },
      { method: 'POST', path: 'lists.create', reply: () => ok({ list: { _id: 'new-positions', key: 'onb-positions', name: 'Onboarding positions' } }) },
    ]);
    expect(await createRegistryIfVacant(app, 'room-1', 'positions')).toEqual({ status: 'created', listId: 'new-positions' });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['GET lists.listByRoomId', 'POST lists.create']);
    const malformed = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({}) }]);
    await expect(createRegistryIfVacant(malformed.app, 'room-1', 'hires')).rejects.toThrow('HUB_LISTS_MALFORMED');
    expect(malformed.calls).toHaveLength(1);
  });

  it('sends parentId, ASSIGNEE and FILE_MULTIPLE object through the MCP Item tool', async () => {
    const calls: { name: string; arguments: Record<string, unknown> }[] = [];
    const app = { callServerTool: async (call: { name: string; arguments: Record<string, unknown> }) => {
      calls.push(call);
      if (call.name === 'mcpapp.lists.createItem') return { item: { id: 'child-1', name: 'Test child', stageId: 'stage-1' } };
      if (call.name === 'mcpapp.lists.getItem') return { item: { id: 'child-1', name: 'Test child', stageId: 'stage-1', parentId: 'parent-1' } };
      throw new Error(`unexpected tool ${call.name}`);
    } } as McpApp;
    await createItem(app, { listId: 'list-1', name: 'Test child', stageId: 'stage-1', parentId: 'parent-1',
      customFields: [{ fieldId: 'assignee-field', value: 'user-b' }, { fieldId: 'files-field', value: [{ _id: 'file-1' }] }] });
    expect(calls[0]).toEqual({ name: 'mcpapp.lists.createItem', arguments: { listId: 'list-1', title: 'Test child', parentId: 'parent-1',
      customFields: [{ fieldId: 'assignee-field', value: 'user-b' }, { fieldId: 'files-field', value: [{ _id: 'file-1' }] }] } });
  });
});

describe('A/B/C ACL requests', () => {
  it('binds member probes to the actual non-admin session and distinct subject IDs', () => {
    expect(actorAllowed('B', 'user-b', false, 'user-b', 'user-c')).toBe(true);
    expect(actorAllowed('C', 'user-c', false, 'user-b', 'user-c')).toBe(true);
    expect(actorAllowed('B', 'user-b', true, 'user-b', 'user-c')).toBe(false);
    expect(actorAllowed('B', 'user-c', false, 'user-b', 'user-c')).toBe(false);
    expect(actorAllowed('C', 'user-c', false, 'user-c', 'user-c')).toBe(false);
  });

  it('recognizes candidate ASSIGNEE readback forms without matching another user', () => {
    expect(assigneeIncludes('user-b', 'user-b')).toBe(true);
    expect(assigneeIncludes({ _id: 'user-b' }, 'user-b')).toBe(true);
    expect(assigneeIncludes([{ id: 'user-a' }, { id: 'user-b' }], 'user-b')).toBe(true);
    expect(assigneeIncludes([{ id: 'user-a' }], 'user-b')).toBe(false);
    expect(assigneeIncludes({ name: 'B' }, 'user-b')).toBe(false);
  });

  it('requires query/readback identity and a verified ordinary field', () => {
    const page = { success: true, items: [{ _id: 'item-1', key: 'known-key', customFields: [{ fieldId: 'f', value: 'read' }] }], count: 1, nextCursor: null };
    expect(queryMatches(200, page, 'known-key', 'item-1')).toBe(true);
    expect(queryMatches(200, { ...page, items: [{ ...page.items[0], key: 'wrong' }] }, 'known-key', 'item-1')).toBe(false);
    expect(updateMatches(200, { success: true }, 200, page, 'known-key', 'item-1', 'f', 'read')).toBe(true);
    expect(updateMatches(200, { success: false }, 200, page, 'known-key', 'item-1', 'f', 'read')).toBe(false);
    expect(updateMatches(200, { success: true }, 200, { ...page, items: [{ ...page.items[0], _id: 'wrong' }] }, 'known-key', 'item-1', 'f', 'read')).toBe(false);
    expect(ordinaryField([{ _id: 'f', name: 'Mã lỗi', type: 'TEXT' }], 'f')).toBe(true);
    expect(ordinaryField([{ _id: 'f', name: 'Nhân sự', type: 'ASSIGNEE' }], 'f')).toBe(false);
    expect(ordinaryField([{ _id: 'f', name: 'Số ngày đã xong', type: 'NUMBER' }], 'f')).toBe(false);
  });
  it('queries a known key with projection and updates only a known item ID', () => {
    expect(aclQuery('list-1', 'target-key')).toEqual({ name: 'mcpapp.lists.queryItems', arguments: {
      listId: 'list-1', filter: { customFields: [{ fieldId: 'key', op: 'is', value: 'target-key' }] },
      count: 1, fields: ['name', 'key', 'stageId', 'parentId', 'customFields'],
    } });
    expect(aclUpdate('item-1', [{ fieldId: 'progress', value: 'read' }])).toEqual({ name: 'mcpapp.lists.updateItem', arguments: {
      itemId: 'item-1', customFields: [{ fieldId: 'progress', value: 'read' }],
    } });
  });

  it('accepts only a denied or empty result for a negative query', () => {
    expect(classifyAclResult('deny', 403, { errorType: 'forbidden' })).toBe('unclassified-denial');
    expect(classifyAclResult('deny', 200, { success: true, items: [], count: 0, nextCursor: null })).toBe('expected-negative');
    expect(classifyAclResult('deny', 200, { success: false, items: [], count: 0, nextCursor: null })).toBe('fail');
    expect(classifyAclResult('deny', 200, { success: true, items: [], count: 1, nextCursor: null })).toBe('fail');
    expect(classifyAclResult('deny', 200, { items: [{ _id: 'item-1' }], count: 1, nextCursor: null })).toBe('fail');
    expect(classifyAclResult('deny', 401, {})).toBe('fail');
    expect(classifyAclResult('allow', 200, { success: true, items: [{ _id: 'item-1', key: 'known-key' }], count: 1, nextCursor: null }, 'known-key', 'item-1')).toBe('pass');
    expect(hiddenTargetVerdict('expected-negative')).toBe('unclassified-target');
    expect(hiddenTargetVerdict('unclassified-denial')).toBe('unclassified-target');
    expect(hiddenTargetVerdict('fail')).toBe('fail');
  });
});

describe('room Files requests', () => {
  it('refuses a failed SDK upload even if a file ID is present', () => {
    expect(uploadResultId({ success: false, file: { _id: 'old-file' } })).toBeUndefined();
    expect(uploadResultId({ success: true, file: { _id: 'new-file' } })).toBe('new-file');
    expect(uploadResultId({ message: { file: { id: 'message-file' } } })).toBe('message-file');
  });

  it('checks the selected parent before creating a child folder', async () => {
    const invalidCalls: string[] = [];
    const invalid = { callServerTool: async (call: { name: string }) => {
      invalidCalls.push(call.name);
      return { folders: [{ id: 'root', name: 'Other', channelId: 'room-1', parentId: null }] };
    } } as McpApp;
    const blocked = await createVerifiedFolder(invalid, 'room-1', 'position-1', 'root');
    expect(blocked).toEqual({ ok: false, reason: 'invalid-parent' });
    expect(invalidCalls).toEqual(['mcpapp.folders.getByChannel']);
    const validCalls: { name: string; arguments: Record<string, unknown> }[] = [];
    let created = false;
    const valid = { callServerTool: async (call: { name: string; arguments: Record<string, unknown> }) => {
      validCalls.push(call);
      if (call.name === 'mcpapp.folders.create') { created = true; return { id: 'child', name: 'position-1' }; }
      return call.arguments.parentId === 'root' ? { folders: created ? [{ id: 'child', name: 'position-1', parentId: 'root' }] : [] }
        : { folders: [{ id: 'root', name: 'Onboarding', channelId: 'room-1', parentId: null }] };
    } } as McpApp;
    expect(await createVerifiedFolder(valid, 'room-1', 'position-1', 'root')).toEqual({ ok: true, folderId: 'child' });
    expect(validCalls.map((call) => call.name)).toEqual(['mcpapp.folders.getByChannel', 'mcpapp.folders.getByChannel', 'mcpapp.folders.create', 'mcpapp.folders.getByChannel']);
  });

  it('refuses root creation without a room target and rejects another room on readback', async () => {
    const unused = { callServerTool: async () => { throw new Error('should not call Hub'); } } as McpApp;
    expect(await createVerifiedFolder(unused, '', 'Onboarding')).toEqual({ ok: false, reason: 'invalid-room' });
    const wrongRoom = { callServerTool: async (call: { name: string }) => call.name === 'mcpapp.folders.create'
      ? { folder: { id: 'root', name: 'Onboarding' } } : { folders: [] } } as McpApp;
    expect(await createVerifiedFolder(wrongRoom, 'room-1', 'Onboarding')).toEqual({ ok: false, reason: 'readback-mismatch' });
  });
  it('creates nested folders and moves a file with documented public payload', () => {
    expect(createFolderRequest('room-1', 'Onboarding')).toEqual({ name: 'mcpapp.folders.create', arguments: { name: 'Onboarding', channelId: 'room-1' } });
    expect(createFolderRequest('room-1', 'position-1', 'folder-1')).toEqual({ name: 'mcpapp.folders.create', arguments: { name: 'position-1', channelId: 'room-1', parentId: 'folder-1' } });
    expect(moveFileRequest('file-1', 'folder-2')).toEqual({ name: 'mcpapp.files.update', arguments: { fileId: 'file-1', folderId: 'folder-2' } });
    expect(uploadFileParams('room-1', 'folder-2', 'probe.pdf', 'data:application/pdf;base64,AA==')).toEqual({ channelId: 'room-1', folderId: 'folder-2', fileName: 'probe.pdf', base64Data: 'data:application/pdf;base64,AA==', duplicateAction: 'keep_both' });
  });

  it('distinguishes an item-owned folder from the normal room folder by metadata', () => {
    expect(fileLocation({ folder_id: 'folder-2', channel_id: 'room-1' }, 'room-1', 'folder-2', 'item-folder')).toBe('room-folder');
    expect(fileLocation({ folder_id: 'item-folder', channel_id: 'room-1' }, 'room-1', 'folder-2', 'item-folder')).toBe('item-folder');
    expect(fileLocation({ folder_id: 'other', channel_id: 'room-1' }, 'room-1', 'folder-2', 'item-folder')).toBe('other');
    expect(fileLocation({ folder_id: 'folder-2', channel_id: 'wrong' }, 'room-1', 'folder-2', 'item-folder')).toBe('other');
  });

  it('requires folder ancestry and file readback identity before PASS', () => {
    const root = { _id: 'root', name: 'Onboarding', father: null, channel_id: 'room-1' };
    const child = { _id: 'child', name: 'position-1', father: 'root', channel_id: 'room-1' };
    expect(folderMatches(root, child, 'room-1', 'position-1')).toBe(true);
    expect(folderMatches(root, { ...child, father: 'wrong' }, 'room-1', 'position-1')).toBe(false);
    expect(folderMatches({ ...root, channel_id: 'wrong' }, child, 'room-1', 'position-1')).toBe(false);
    expect(itemFolderMatches({ _id: 'item-folder', channel_id: 'room-1', itemId: 'item-1' }, 'room-1', 'item-folder', 'item-1')).toBe(true);
    expect(itemFolderMatches({ _id: 'item-folder', channel_id: 'room-1' }, 'room-1', 'item-folder', 'item-1')).toBe(false);
    expect(fileMatches(200, { success: true, file: { _id: 'file-1', folder_id: 'child', channel_id: 'room-1' } }, 'file-1', 'room-1', 'child')).toBe(true);
    expect(fileMatches(200, { success: false, file: { _id: 'file-1', folder_id: 'child', channel_id: 'room-1' } }, 'file-1', 'room-1', 'child')).toBe(false);
    expect(fileMatches(200, { success: true, file: { _id: 'wrong', folder_id: 'child', channel_id: 'room-1' } }, 'file-1', 'room-1', 'child')).toBe(false);
  });
});

describe('probe confirmation', () => {
  it('invalidates consent and download proof whenever a target changes', () => {
    const confirmed = { confirmed: true, openUrl: 'https://example.test/file', downloadConfirmation: 'confirmed' as const };
    expect(probeSafetyReducer(confirmed, { type: 'target-change' })).toEqual({ confirmed: false, openUrl: '', downloadConfirmation: 'not-run' });
    expect(probeSafetyReducer(confirmed, { type: 'confirm', value: false })).toEqual({ ...confirmed, confirmed: false });
  });
});
