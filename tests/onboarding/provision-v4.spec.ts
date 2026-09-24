import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { V2, V2_HIRE_FIELDS, V2_POSITION_FIELDS } from '../../src/ui/onboarding/domain/v2-fields';
import type { Catalogs } from '../../src/ui/onboarding/data/catalogs';
import { planRunNodes, provisionV4, resumeV4, templateFingerprint, type PreparedProvisionV4 } from '../../src/ui/onboarding/flows/provision-v4';

const tree: TemplateTree = {
  weeks: [
    { id: 'week-2', name: 'Week 2', order: 2 }, { id: 'week-1', name: 'Week 1', order: 1 },
  ],
  items: [
    { id: 'q-1', name: 'Quiz', kind: 'question', stageId: 'week-1', parentId: 'day-1', order: 1, content: 'Pick', options: ['A', 'B'], correctLabels: ['b'], explanation: 'Because', selectedLabels: [], correct: null },
    { id: 'day-2', name: 'Day 2', kind: 'day', stageId: 'week-2', parentId: null, order: 2, content: '' },
    { id: 'lesson-1', name: 'Guide', kind: 'lesson', stageId: 'week-1', parentId: 'day-1', order: 0, content: 'Read', attachments: [{ id: 'file-1', name: 'guide.pdf', raw: { _id: 'file-1', name: 'guide.pdf' } }], videos: [], read: false },
    { id: 'day-1', name: 'Day 1', kind: 'day', stageId: 'week-1', parentId: null, order: 1, content: '' },
    { id: 'lesson-2', name: 'Guide 2', kind: 'lesson', stageId: 'week-2', parentId: 'day-2', order: 0, content: 'Read 2', attachments: [], videos: [], read: false },
  ],
};

function prepared(fingerprint: string): PreparedProvisionV4 {
  return { input: { positionId: 'position-1', employeeId: 'employee-1', employeeName: 'Minh', startDate: '2026-09-25', operationId: 'operation-12345678' },
    position: { id: 'position-1', name: 'Engineer', templateListId: 'template-1', status: 'ready', weeks: 2, days: 2, lessons: 2, questions: 1, missingAnswers: 0, inUse: 0 },
    tree, fingerprint };
}

describe('P4 run planning', () => {
  it('places week items before days and children under the fixed content stage', () => {
    expect(planRunNodes(tree).map(({ sourceId, parentSourceId }) => [sourceId, parentSourceId])).toEqual([
      ['week-1', '__overview__'], ['week-2', '__overview__'], ['day-1', 'week-1'], ['day-2', 'week-2'],
      ['lesson-1', 'day-1'], ['q-1', 'day-1'], ['lesson-2', 'day-2'],
    ]);
  });

  it('uses a canonical fingerprint independent of query order', async () => {
    const shuffled = { weeks: [...tree.weeks].reverse(), items: [...tree.items].reverse() };
    expect(await templateFingerprint(tree)).toBe(await templateFingerprint(shuffled));
    expect(await templateFingerprint({ ...tree, items: tree.items.map((item) => item.id === 'lesson-1' && item.kind === 'lesson' ? { ...item, content: 'Changed' } : item) }))
      .not.toBe(await templateFingerprint(tree));
  });

  it('refuses non-admin actors before a Hub write', async () => {
    const calls: string[] = [];
    const app = { callServerTool: async ({ name }: { name: string }) => { calls.push(name); return {}; } } as unknown as McpApp;
    await expect(provisionV4(app, { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' }, prepared('fingerprint'), ['member']))
      .rejects.toThrow('NOT_ADMIN');
    expect(calls).toEqual([]);
  });
});

function hubFixture(options: { loseListResponse?: boolean; loseHireResponse?: boolean; ignoreParentField?: boolean;
  corruptParentBeforeFinalRead?: boolean } = {}) {
  const hireFields = V2_HIRE_FIELDS.map((field, index) => ({ _id: `hire-field-${index}`, name: field.name, type: field.type }));
  const hireIds = Object.fromEntries(hireFields.map((field) => [field.name, field._id]));
  const positionFields = V2_POSITION_FIELDS.map((field, index) => ({ _id: `position-field-${index}`, name: field.name, type: field.type }));
  const positionIds = Object.fromEntries(positionFields.map((field) => [field.name, field._id]));
  const lists = new Map<string, { _id: string; name: string; key: string; roomId: string; isolatedList: boolean;
    fieldDefinitions: { _id: string; name: string; type: string; options?: { _id: string; value: string }[] }[];
    stages: { _id: string; name: string; order: number }[] }>();
  lists.set('hires-1', { _id: 'hires-1', name: 'Onboarding hires', key: 'onb-hires', roomId: 'room-1', isolatedList: true,
    fieldDefinitions: hireFields, stages: [{ _id: 'provisioning', name: 'Đang khởi tạo', order: 0 }, { _id: 'learning', name: 'Đang học', order: 1 }, { _id: 'failed', name: 'Khởi tạo lỗi', order: 2 }] });
  lists.set('positions-1', { _id: 'positions-1', name: 'Onboarding positions', key: 'onb-positions', roomId: 'room-1', isolatedList: true,
    fieldDefinitions: positionFields, stages: [{ _id: 'ready', name: 'Sẵn sàng', order: 0 }] });
  const items = new Map<string, { _id: string; listId: string; name: string; stageId: string; parentId: string | null;
    customFields: { fieldId: string; value: unknown }[] }[]>([['hires-1', []], ['positions-1', [
      { _id: 'position-1', listId: 'positions-1', name: 'Engineer', stageId: 'ready', parentId: null,
        customFields: [{ fieldId: positionIds[V2.inUse], value: 0 }] },
    ]]]);
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  let sequence = 0;
  let runReads = 0;
  const app = { callServerTool: async (call: { name: string; arguments: Record<string, unknown> }): Promise<unknown> => {
    calls.push(call);
    const args = call.arguments;
    if (call.name === 'mcpapp.lists.getAll') return { lists: [...lists.values()] };
    if (call.name === 'mcpapp.lists.get') {
      const list = lists.get(String(args.listId));
      if (!list) throw new Error('missing list');
      return { list, stages: list.stages };
    }
    if (call.name === 'mcpapp.lists.create') {
      const id = 'run-1';
      const definitions = (args.fieldDefinitions as { name: string; type: string; options?: { value: string }[] }[])
        .map((definition, index) => ({ _id: `run-field-${index}`, name: definition.name, type: definition.type,
          ...(definition.options ? { options: definition.options.map((option, optionIndex) => ({ _id: `option-${index}-${optionIndex}`, value: option.value })) } : {}) }));
      const list = { _id: id, name: String(args.name), key: String(args.key), roomId: 'room-1', isolatedList: true,
        fieldDefinitions: definitions, stages: [{ _id: 'content', name: 'Nội dung', order: 0 }] };
      lists.set(id, list);
      items.set(id, []);
      if (options.loseListResponse) { options.loseListResponse = false; throw new Error('lost list response'); }
      return { list, stages: list.stages };
    }
    if (call.name === 'mcpapp.lists.queryItems') {
      if (args.listId === 'run-1' && ++runReads === 2 && options.corruptParentBeforeFinalRead) {
        const week = items.get('run-1')!.find((row) => runField(row, V2.source) === 'week-1')!;
        const parentField = lists.get('run-1')!.fieldDefinitions.find((definition) => definition.name === V2.parent)!._id;
        week.customFields.find((entry) => entry.fieldId === parentField)!.value = 'wrong-parent';
      }
      const filter = args.filter as { stageId?: string; customFields?: { fieldId: string; op: string; value: string }[] } | undefined;
      const selected = (items.get(String(args.listId)) ?? []).filter((row) =>
        (!filter?.stageId || row.stageId === filter.stageId) &&
        (filter?.customFields ?? []).every((condition) => row.customFields.some((field) => field.fieldId === condition.fieldId && field.value === condition.value)));
      return { items: selected, nextCursor: null };
    }
    if (call.name === 'mcpapp.lists.createItem') {
      const listId = String(args.listId);
      const row = { _id: `item-${++sequence}`, listId, name: String(args.title), stageId: lists.get(listId)!.stages[0]._id,
        parentId: null,
        customFields: (args.customFields as { fieldId: string; value: unknown }[]).filter((entry) =>
          !options.ignoreParentField || listId !== 'run-1' ||
          entry.fieldId !== lists.get('run-1')!.fieldDefinitions.find((definition) => definition.name === V2.parent)?._id) };
      items.get(listId)!.push(row);
      if (listId === 'hires-1' && options.loseHireResponse) { options.loseHireResponse = false; throw new Error('lost hire response'); }
      return { item: row };
    }
    if (call.name === 'mcpapp.lists.getItem' || call.name === 'mcpapp.lists.updateItem' || call.name === 'mcpapp.lists.moveItemToStage') {
      const row = [...items.values()].flat().find((entry) => entry._id === args.itemId);
      if (!row) throw new Error('missing item');
      if (call.name === 'mcpapp.lists.updateItem') row.customFields = args.customFields as typeof row.customFields;
      if (call.name === 'mcpapp.lists.moveItemToStage') row.stageId = String(args.stageId);
      return { item: row };
    }
    throw new Error(`unexpected tool ${call.name}`);
  } } as unknown as McpApp;
  const runField = (item: (typeof items extends Map<string, (infer T)[]> ? T : never), name: string): unknown => {
    const definition = lists.get('run-1')!.fieldDefinitions.find((field) => field.name === name)!;
    return item.customFields.find((field) => field.fieldId === definition._id)?.value;
  };
  return { app, lists, items, calls, hireIds, positionIds, runField };
}

function catalogsFor(hub: ReturnType<typeof hubFixture>, input: PreparedProvisionV4): Pick<Catalogs, 'position' | 'template' | 'hires'> {
  return {
    position: async () => input.position,
    template: async () => tree,
    hires: async () => ({ items: hub.items.get('hires-1')!.map((row) => {
      const checkpointField = row.customFields.find((field) => field.fieldId === hub.hireIds[V2.provision])?.value;
      const checkpoint = typeof checkpointField === 'string' ? JSON.parse(checkpointField) as { employeeId: string } : null;
      return { id: row._id, name: row.name, employeeId: checkpoint?.employeeId ?? '', positionId: input.position.id,
        positionName: input.position.name, totalDays: 2, startDate: input.input.startDate, roadmapListId: null,
        status: row.stageId === 'learning' ? 'learning' as const : row.stageId === 'failed' ? 'failed' as const : 'provisioning' as const,
        doneDays: 0, scores: {}, errorCode: null, pendingAction: null };
    }), nextCursor: null }),
  };
}

describe('provisionV4 writer', () => {
  it('creates a private run, copies the hierarchy and content, then grants access and activates', async () => {
    const hub = hubFixture();
    const fingerprint = await templateFingerprint(tree);
    const input = prepared(fingerprint);
    const catalogs: Pick<Catalogs, 'position' | 'template' | 'hires'> = {
      position: async () => input.position,
      template: async () => tree,
      hires: async () => ({ items: [], nextCursor: null }),
    };
    const result = await provisionV4(hub.app, { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' }, input, ['owner'], undefined, catalogs);
    expect(result).toMatchObject({ state: 'active', roadmapListId: 'run-1' });
    const rows = hub.items.get('run-1')!;
    expect(rows).toHaveLength(8);
    const bySource = new Map(rows.map((row) => [hub.runField(row, V2.source), row]));
    expect(rows.every((row) => row.parentId === null)).toBe(true);
    expect(hub.runField(bySource.get('__overview__')!, V2.parent)).toBe('');
    expect(hub.runField(bySource.get('week-1')!, V2.parent)).toBe(bySource.get('__overview__')?._id);
    expect(hub.runField(bySource.get('day-1')!, V2.parent)).toBe(bySource.get('week-1')?._id);
    expect(hub.runField(bySource.get('q-1')!, V2.parent)).toBe(bySource.get('day-1')?._id);
    expect(rows.every((row) => row.stageId === 'content')).toBe(true);
    expect(hub.runField(bySource.get('q-1')!, V2.answers)).toBe('b');
    expect(hub.runField(bySource.get('q-1')!, V2.explanation)).toBe('Because');
    expect(hub.runField(bySource.get('lesson-1')!, V2.attachments)).toEqual([{ _id: 'file-1', name: 'guide.pdf' }]);
    expect(hub.runField(bySource.get('lesson-1')!, V2.read)).toBe(false);
    expect(hub.runField(bySource.get('q-1')!, V2.selected)).toBe('');
    const hire = hub.items.get('hires-1')![0];
    expect(hire.stageId).toBe('learning');
    expect(hire.customFields.find((field) => field.fieldId === hub.hireIds[V2.employee])?.value).toBe('employee-1');
    expect(hub.items.get('positions-1')![0].customFields.find((field) => field.fieldId === hub.positionIds[V2.inUse])?.value).toBe(1);
    const firstGrant = hub.calls.findIndex((call) => call.name === 'mcpapp.lists.updateItem' && String(call.arguments.itemId) !== hire._id &&
      (call.arguments.customFields as { fieldId: string }[]).some((field) => field.fieldId === hub.lists.get('run-1')!.fieldDefinitions.find((definition) => definition.name === V2.assignee)!._id));
    const lastCreate = hub.calls.findLastIndex((call) => call.name === 'mcpapp.lists.createItem');
    expect(firstGrant).toBeGreaterThan(lastCreate);
    expect(hub.calls.filter((call) => call.name === 'mcpapp.lists.queryItems' && call.arguments.listId === 'run-1')).toHaveLength(2);
  });

  it('resumes a run after list creation succeeded but its response was lost', async () => {
    const hub = hubFixture({ loseListResponse: true });
    const input = prepared(await templateFingerprint(tree));
    const catalogs: Pick<Catalogs, 'position' | 'template' | 'hires'> = {
      position: async () => input.position, template: async () => tree,
      hires: async () => ({ items: [], nextCursor: null }),
    };
    const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
    await expect(provisionV4(hub.app, binding, input, ['owner'], undefined, catalogs)).rejects.toThrow('lost list response');
    const hireId = hub.items.get('hires-1')![0]._id;
    expect((await resumeV4(hub.app, binding, hireId, input, ['owner'], undefined, catalogs)).roadmapListId).toBe('run-1');
    expect(hub.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(1);
    expect(hub.items.get('run-1')).toHaveLength(8);
  });

  it('rejects a run item when Hub drops its logical parent field on readback', async () => {
    const hub = hubFixture({ ignoreParentField: true });
    const input = prepared(await templateFingerprint(tree));
    const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
    await expect(provisionV4(hub.app, binding, input, ['owner'], undefined, catalogsFor(hub, input)))
      .rejects.toThrow('SCHEMA_DRIFT');
    expect(hub.items.get('hires-1')![0].stageId).not.toBe('learning');
  });

  it('rechecks logical parents before granting access when a later read changes', async () => {
    const hub = hubFixture({ corruptParentBeforeFinalRead: true });
    const input = prepared(await templateFingerprint(tree));
    const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
    await expect(provisionV4(hub.app, binding, input, ['owner'], undefined, catalogsFor(hub, input)))
      .rejects.toThrow('SCHEMA_DRIFT');
    expect(hub.items.get('hires-1')![0].stageId).not.toBe('learning');
    expect(hub.calls.some((call) => call.name === 'mcpapp.lists.updateItem' &&
      hub.items.get('run-1')!.some((row) => row._id === call.arguments.itemId))).toBe(false);
  });

  it('reuses the B1 hire after create succeeds but its response is lost', async () => {
    const hub = hubFixture({ loseHireResponse: true });
    const input = prepared(await templateFingerprint(tree));
    const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
    const catalogs = catalogsFor(hub, input);
    await expect(provisionV4(hub.app, binding, input, ['owner'], undefined, catalogs)).rejects.toThrow('lost hire response');
    expect((await provisionV4(hub.app, binding, input, ['owner'], undefined, catalogs)).state).toBe('active');
    expect(hub.items.get('hires-1')).toHaveLength(1);
    expect(hub.calls.filter((call) => call.name === 'mcpapp.lists.createItem' && call.arguments.listId === 'hires-1')).toHaveLength(1);
  });

  it('continues a failed checkpoint without making another hire or run', async () => {
    const hub = hubFixture({ loseListResponse: true });
    const input = prepared(await templateFingerprint(tree));
    const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
    const catalogs = catalogsFor(hub, input);
    await expect(provisionV4(hub.app, binding, input, ['owner'], undefined, catalogs)).rejects.toThrow('lost list response');
    const hire = hub.items.get('hires-1')![0];
    hire.stageId = 'failed';
    expect((await resumeV4(hub.app, binding, hire._id, input, ['owner'], undefined, catalogs)).state).toBe('active');
    expect(hub.items.get('hires-1')).toHaveLength(1);
    expect(hub.calls.filter((call) => call.name === 'mcpapp.lists.create')).toHaveLength(1);
  });

  it('rejects a resume request carrying a different operation ID', async () => {
    const hub = hubFixture({ loseListResponse: true });
    const input = prepared(await templateFingerprint(tree));
    const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
    const catalogs = catalogsFor(hub, input);
    await expect(provisionV4(hub.app, binding, input, ['owner'], undefined, catalogs)).rejects.toThrow('lost list response');
    const hireId = hub.items.get('hires-1')![0]._id;
    const other = { ...input, input: { ...input.input, operationId: 'different-operation-123' } };
    await expect(resumeV4(hub.app, binding, hireId, other, ['owner'], undefined, catalogs)).rejects.toThrow('HIRE_EXISTS');
    expect(hub.items.get('run-1')).toHaveLength(0);
  });
});
