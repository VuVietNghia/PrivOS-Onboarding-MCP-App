import type { McpApp } from '@privos_ai/app-react';
import { describe, expect, it } from 'vitest';
import { saveTemplateV4 } from '../../src/ui/onboarding/flows/save-template-v4';
import { V2, V2_POSITION_FIELDS } from '../../src/ui/onboarding/domain/v2-fields';

interface Field { _id: string; name: string; type: string; options?: { _id: string; value: string }[] }
interface Row { _id: string; listId: string; name: string; description?: string; stageId: string; parentId?: string; customFields: { fieldId: string; value: unknown }[] }
interface List { _id: string; name: string; roomId: string; isolatedList: boolean; fieldDefinitions: Field[]; stages: { _id: string; name: string; order: number }[] }

function fakeHub(options: { loseDayResponse?: boolean; dropTemplateCustomFieldUpdates?: boolean; omitEmptyTemplateFields?: boolean;
  dropAttachmentUpdates?: boolean; dropRegistryCountUpdates?: boolean } = {}): { app: McpApp; calls: string[]; lists: Map<string, List>; rows: Map<string, Row> } {
  const calls: string[] = [];
  const lists = new Map<string, List>();
  const rows = new Map<string, Row>();
  let next = 0;
  const id = () => `id-${++next}`;
  const positions: List = { _id: 'positions', name: 'Onboarding positions', roomId: 'room', isolatedList: true,
    fieldDefinitions: V2_POSITION_FIELDS.map((field) => ({ _id: id(), name: field.name, type: field.type })),
    stages: ['Đang soạn', 'Sẵn sàng', 'Ngừng dùng'].map((name, order) => ({ _id: id(), name, order })) };
  lists.set(positions._id, positions);
  const app = { callServerTool: async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => {
    calls.push(name);
    switch (name) {
      case 'mcpapp.lists.get': return { list: lists.get(String(args.listId)) };
      case 'mcpapp.lists.create': {
        const list: List = { _id: id(), name: String(args.name), roomId: String(args.roomId), isolatedList: true,
          fieldDefinitions: (args.fieldDefinitions as { name: string; type: string; options?: { value: string }[] }[]).map((field) => ({ _id: id(), name: field.name, type: field.type,
            ...(field.options ? { options: field.options.map((option) => ({ _id: id(), value: option.value })) } : {}) })),
          stages: (args.stages as { name: string }[]).map((stage, order) => ({ _id: id(), name: stage.name, order })) };
        lists.set(list._id, list);
        return { list };
      }
      case 'mcpapp.lists.queryItems': return { items: [...rows.values()].filter((row) => row.listId === args.listId), nextCursor: null };
      case 'mcpapp.lists.createItem': {
        const list = lists.get(String(args.listId))!;
        const rawFields = args.customFields as Row['customFields'];
        const optionalNames = new Set<string>([V2.content, V2.options, V2.explanation, V2.videos, V2.multiple]);
        const optionalIds = new Set(list.fieldDefinitions.filter((field) => optionalNames.has(field.name)).map((field) => field._id));
        const item: Row = { _id: id(), listId: list._id, name: String(args.title), stageId: list.stages[0]._id,
          ...(args.description !== undefined ? { description: String(args.description) } : {}),
          customFields: options.omitEmptyTemplateFields ? rawFields.filter((field) =>
            !optionalIds.has(field.fieldId) || (field.value !== '' && field.value !== false)) : rawFields };
        rows.set(item._id, item);
        if (options.loseDayResponse && args.title === 'Ngày 1') { options.loseDayResponse = false; throw new Error('lost create response'); }
        return { item };
      }
      case 'mcpapp.lists.getItem': return { item: rows.get(String(args.itemId)) };
      case 'mcpapp.lists.updateItem': {
        const row = rows.get(String(args.itemId))!;
        if (args.title !== undefined) row.name = String(args.title);
        if (args.description !== undefined) row.description = String(args.description);
        if (row.listId === 'positions' || !options.dropTemplateCustomFieldUpdates) {
          const updates = args.customFields as Row['customFields'];
          const list = lists.get(row.listId)!;
          const registryCounts = new Set<string>([V2.weeks, V2.days, V2.lessons, V2.questions, V2.missingAnswers]);
          const blocked = new Set(list.fieldDefinitions.filter((field) =>
            (options.dropAttachmentUpdates && field.name === V2.attachments) ||
            (options.dropRegistryCountUpdates && row.listId === 'positions' && registryCounts.has(field.name))
          ).map((field) => field._id));
          row.customFields = updates.map((field) => blocked.has(field.fieldId)
            ? row.customFields.find((old) => old.fieldId === field.fieldId) ?? field : field);
        }
        return { item: row };
      }
      case 'mcpapp.lists.moveItemToStage': {
        const row = rows.get(String(args.itemId))!;
        row.stageId = String(args.stageId);
        return { item: row };
      }
      default: throw new Error(`Unexpected tool ${name}`);
    }
  } } as unknown as McpApp;
  return { app, calls, lists, rows };
}

describe('saveTemplateV4', () => {
  it('persists an incomplete draft as Week item in a fixed content Stage and verifies registry link', async () => {
    const hub = fakeHub();
    const positionId = await saveTemplateV4(hub.app, { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' }, {
      name: 'Backend Engineer', status: 'draft', tree: { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [] },
    });
    const position = hub.rows.get(positionId)!;
    const template = [...hub.lists.values()].find((list) => list._id !== 'positions')!;
    const week = [...hub.rows.values()].find((row) => row.listId === template._id)!;
    expect(template.stages.map((stage) => stage.name)).toEqual(['Nội dung']);
    expect(week.parentId).toBeUndefined();
    expect(week.stageId).toBe(template.stages[0]._id);
    expect(position.customFields).toContainEqual({ fieldId: hub.lists.get('positions')!.fieldDefinitions[0]._id, value: template._id });
  });

  it('rejects an unready template before any write', async () => {
    const hub = fakeHub();
    await expect(saveTemplateV4(hub.app, { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' }, {
      name: 'Backend Engineer', status: 'ready', tree: { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [] },
    })).rejects.toMatchObject({ code: 'TEMPLATE_INVALID' });
    expect(hub.calls).toEqual([]);
  });

  it('publishes a lesson-only day with logical parent links in Cha after Hub drops parentId', async () => {
    const hub = fakeHub();
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: 'Mục tiêu' },
      { id: 'draft:lesson', kind: 'lesson' as const, name: 'Bài 1', stageId: 'draft:week', parentId: 'draft:day', order: 0,
        content: 'Học bài', attachments: [], videos: [], read: false },
    ] };
    const positionId = await saveTemplateV4(hub.app, { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' },
      { name: 'Backend Engineer', status: 'ready', tree });
    const position = hub.rows.get(positionId)!;
    const templateRows = [...hub.rows.values()].filter((row) => row.listId !== 'positions');
    expect(templateRows).toHaveLength(3);
    const parentFieldId = hub.lists.get(templateRows[0].listId)!.fieldDefinitions.find((field) => field.name === V2.parent)!._id;
    const parentOf = (row: Row | undefined) => row?.customFields.find((field) => field.fieldId === parentFieldId)?.value;
    expect(templateRows.every((row) => row.parentId === undefined)).toBe(true);
    expect(parentOf(templateRows.find((row) => row.name === 'Ngày 1'))).toBe(templateRows.find((row) => row.name === 'Tuần 1')?._id);
    expect(parentOf(templateRows.find((row) => row.name === 'Bài 1'))).toBe(templateRows.find((row) => row.name === 'Ngày 1')?._id);
    expect(position.stageId).toBe(hub.lists.get('positions')!.stages[1]._id);
  });

  it('reconciles a lost day create response without creating a duplicate orphan', async () => {
    const hub = fakeHub({ loseDayResponse: true });
    await saveTemplateV4(hub.app, { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' }, {
      name: 'Backend Engineer', status: 'draft', tree: { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
        { id: 'draft:day', kind: 'day', name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: '' },
      ] },
    });
    expect([...hub.rows.values()].filter((row) => row.name === 'Ngày 1')).toHaveLength(1);
  });

  it('resaves the same draft tree without duplicating items after native parentId was omitted', async () => {
    const hub = fakeHub();
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: '' },
    ] };
    const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };
    const positionId = await saveTemplateV4(hub.app, binding, { name: 'Backend Engineer', status: 'draft', tree });
    await saveTemplateV4(hub.app, binding, { positionId, name: 'Backend Engineer', status: 'draft', tree });
    expect([...hub.rows.values()].filter((row) => row.listId !== 'positions')).toHaveLength(2);
  });

  it('không báo đã lưu khi Hub bỏ qua nội dung bài học trong template đang chỉnh sửa', async () => {
    const options = { dropTemplateCustomFieldUpdates: false };
    const hub = fakeHub(options);
    const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: 'Mục tiêu' },
      { id: 'draft:lesson', kind: 'lesson' as const, name: 'Bài 1', stageId: 'draft:week', parentId: 'draft:day', order: 0,
        content: 'Nội dung cũ', attachments: [], videos: [], read: false },
    ] };
    const positionId = await saveTemplateV4(hub.app, binding, { name: 'Engineer', status: 'ready', tree });
    options.dropTemplateCustomFieldUpdates = true;
    const changed = { ...tree, items: tree.items.map((item) => item.kind === 'lesson' ? { ...item, content: 'Nội dung mới' } : item) };
    await expect(saveTemplateV4(hub.app, binding, { positionId, name: 'Engineer', status: 'ready', tree: changed }))
      .rejects.toMatchObject({ code: 'SCHEMA_DRIFT' });
  });

  it('cho phép chỉnh sửa template ngừng dùng và chuyển về nháp hoặc sẵn sàng', async () => {
    const hub = fakeHub();
    const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: '' },
      { id: 'draft:lesson', kind: 'lesson' as const, name: 'Bài 1', stageId: 'draft:week', parentId: 'draft:day', order: 0,
        content: 'Nội dung', attachments: [], videos: [], read: false },
    ] };
    const positionId = await saveTemplateV4(hub.app, binding, { name: 'Engineer', status: 'ready', tree });
    const position = hub.rows.get(positionId)!;
    const stages = hub.lists.get('positions')!.stages;
    position.stageId = stages[2]._id;

    await saveTemplateV4(hub.app, binding, { positionId, name: 'Engineer', status: 'draft', tree });
    expect(position.stageId).toBe(stages[0]._id);

    position.stageId = stages[2]._id;
    await saveTemplateV4(hub.app, binding, { positionId, name: 'Engineer', status: 'ready', tree });
    expect(position.stageId).toBe(stages[1]._id);
  });

  it('chấp nhận giá trị mặc định khi Hub bỏ field text rỗng và checkbox false', async () => {
    const hub = fakeHub({ omitEmptyTemplateFields: true });
    const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: '' },
      { id: 'draft:lesson', kind: 'lesson' as const, name: 'Bài 1', stageId: 'draft:week', parentId: 'draft:day', order: 0,
        content: 'Nội dung', attachments: [], videos: [], read: false },
    ] };
    const positionId = await saveTemplateV4(hub.app, binding, { name: 'Engineer', status: 'ready', tree });
    expect(hub.rows.get(positionId)?.stageId).toBe(hub.lists.get('positions')?.stages[1]._id);
  });

  it('rejects an attachment edit that Hub silently drops', async () => {
    const options = { dropAttachmentUpdates: false };
    const hub = fakeHub(options);
    const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };
    const oldFile = { _id: 'file-old', name: 'old.pdf' };
    const newFile = { _id: 'file-new', name: 'new.pdf' };
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: '' },
      { id: 'draft:lesson', kind: 'lesson' as const, name: 'Bài 1', stageId: 'draft:week', parentId: 'draft:day', order: 0,
        content: 'Nội dung', attachments: [{ id: 'file-old', name: 'old.pdf', raw: oldFile }], videos: [], read: false },
    ] };
    const positionId = await saveTemplateV4(hub.app, binding, { name: 'Engineer', status: 'draft', tree });
    options.dropAttachmentUpdates = true;
    const changed = { ...tree, items: tree.items.map((item) => item.kind === 'lesson'
      ? { ...item, attachments: [{ id: 'file-new', name: 'new.pdf', raw: newFile }] } : item) };
    await expect(saveTemplateV4(hub.app, binding, { positionId, name: 'Engineer', status: 'draft', tree: changed }))
      .rejects.toMatchObject({ code: 'SCHEMA_DRIFT' });
  });

  it('rejects stale registry totals after a template edit', async () => {
    const options = { dropRegistryCountUpdates: false };
    const hub = fakeHub(options);
    const binding = { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' };
    const tree = { weeks: [{ id: 'draft:week', name: 'Tuần 1', order: 0 }], items: [] };
    const positionId = await saveTemplateV4(hub.app, binding, { name: 'Engineer', status: 'draft', tree });
    options.dropRegistryCountUpdates = true;
    const changed = { ...tree, items: [
      { id: 'draft:day', kind: 'day' as const, name: 'Ngày 1', stageId: 'draft:week', parentId: null, order: 1, content: '' },
    ] };
    await expect(saveTemplateV4(hub.app, binding, { positionId, name: 'Engineer', status: 'draft', tree: changed }))
      .rejects.toMatchObject({ code: 'SCHEMA_DRIFT' });
  });
});
