// src/ui/onboarding/data/onboarding-lists.ts
import type { McpApp } from '@privos_ai/app-react';
import { OptionalFeatureUnavailableError, PrivosRestError, restCall } from '../../privos-rest';
import type { FieldDef, FieldSpec, HubItem } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';
import { idOf, unwrapToolResult } from './tool-result';

export interface HubList { _id: string; name: string; key?: string; isolatedList?: boolean; fieldDefinitions?: FieldDef[] }

const PAGE = 200;
const MAX_PAGES = 1000;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function callTool(app: McpApp, name: string, args: Record<string, unknown>): Promise<unknown> {
  return unwrapToolResult(await app.callServerTool({ name, arguments: args }));
}

function requiredId(value: unknown): string {
  const id = idOf(value);
  if (!id) throw new Error('HUB_ID_MISSING');
  return id;
}

function hubList(value: unknown): HubList {
  const source = object(value);
  if (!source || typeof source.name !== 'string') throw new Error('HUB_LIST_MALFORMED');
  const fieldDefinitions = Array.isArray(source.fieldDefinitions) ? source.fieldDefinitions.map((raw) => {
    const field = object(raw);
    if (!field || typeof field.name !== 'string' || typeof field.type !== 'string') throw new Error('HUB_FIELD_DEFINITION_MALFORMED');
    return { ...field, _id: requiredId(field), name: field.name, type: field.type };
  }) : undefined;
  return { ...source, _id: requiredId(source), name: source.name,
    ...(fieldDefinitions ? { fieldDefinitions } : {}) } as HubList;
}

function hubItem(value: unknown): HubItem {
  const source = object(value);
  if (!source) throw new Error('HUB_ITEM_MALFORMED');
  const stageId = source.stageId ?? source.stage_id;
  const parentId = source.parentId ?? source.parent_id;
  return { ...source, _id: requiredId(source),
    ...(typeof stageId === 'string' ? { stageId } : {}),
    ...(typeof parentId === 'string' || parentId === null ? { parentId } : {}),
    ...(source.customFields !== undefined ? { customFields: fieldsOf(source.customFields) } : {}),
  } as HubItem;
}

function fieldsOf(value: unknown): { fieldId: string; value: unknown }[] {
  if (Array.isArray(value)) return value.map((entry) => {
    const field = object(entry);
    if (!field || typeof field.fieldId !== 'string') throw new Error('HUB_FIELDS_MALFORMED');
    return { fieldId: field.fieldId, value: field.value };
  });
  if (object(value)) return Object.entries(object(value) ?? {}).map(([fieldId, fieldValue]) => {
    const entry = object(fieldValue);
    return { fieldId, value: entry && 'value' in entry ? entry.value : fieldValue };
  });
  if (value === undefined) return [];
  throw new Error('HUB_FIELDS_MALFORMED');
}

export async function listRoomLists(app: McpApp, roomId: string): Promise<HubList[]> {
  const payload = await callTool(app, 'mcpapp.lists.getAll', { roomId });
  const lists = Array.isArray(payload) ? payload : object(payload)?.lists;
  if (!Array.isArray(lists)) throw new Error('HUB_LISTS_MALFORMED');
  return lists.map(hubList);
}

export async function getListInfo(app: McpApp, listId: string): Promise<{ list: HubList; stages: StageRef[] }> {
  const [rawList, rawStages] = await Promise.all([
    callTool(app, 'mcpapp.lists.get', { listId }),
    callTool(app, 'mcpapp.stages.getByList', { listId }),
  ]);
  const list = hubList(object(rawList)?.list ?? rawList);
  const stages = Array.isArray(rawStages) ? rawStages : object(rawStages)?.stages;
  if (list._id !== listId || !Array.isArray(stages)) throw new Error('HUB_LIST_INFO_MALFORMED');
  return { list, stages: stages.map((entry, order) => {
    const stage = object(entry);
    if (!stage || typeof stage.name !== 'string') throw new Error('HUB_STAGE_MALFORMED');
    return { _id: requiredId(stage), name: stage.name, order: typeof stage.order === 'number' ? stage.order : order };
  }) };
}

export interface CreateListInput {
  roomId: string; name: string; key: string; fields: FieldSpec[];
  stages: { name: string; color?: string; order?: number }[]; isolated: boolean;
}

export async function createList(app: McpApp, input: CreateListInput): Promise<HubList> {
  if (!input.isolated) throw new Error('HUB_LIST_MUST_BE_ISOLATED');
  const payload = await callTool(app, 'mcpapp.lists.create', {
    roomId: input.roomId, name: input.name, key: input.key, isolatedList: true, crossTeamWorkflow: false,
    fieldDefinitions: input.fields.map((f) => ({ name: f.name, type: f.type, ...(f.options ? { options: f.options.map((value) => ({ value })) } : {}) })),
    stages: input.stages.map((stage, index) => ({ name: stage.name, color: stage.color ?? ['#3b82f6', '#22c55e', '#f59e0b'][index % 3] })),
  });
  return hubList(object(payload)?.list ?? payload);
}

export async function renameList(app: McpApp, listId: string, name: string): Promise<void> {
  await callTool(app, 'mcpapp.lists.updateList', { listId, name });
}

export async function deleteList(app: McpApp, listId: string): Promise<boolean> {
  try {
    await callTool(app, 'mcpapp.lists.delete', { listId });
    return true;
  } catch (err) {
    // 404 (list/route không tồn tại), 405 (route không được host hỗ trợ) và 403
    // (OptionalFeatureUnavailableError — thiếu quyền optional) đều coi là "route
    // không dùng được": Hub thật hay trả 403/405 thay vì 404 trong tình huống
    // này, và spike Q4 chưa chạy nên không được giả định chỉ có 404.
    if (err instanceof PrivosRestError && (err.statusCode === 403 || err.statusCode === 404 || err.statusCode === 405)) return false;
    if (err instanceof OptionalFeatureUnavailableError) return false;
    throw err;
  }
}

export interface CreateItemInput {
  listId: string; name: string; stageId: string; parentId?: string;
  description?: string;
  customFields: { fieldId: string; value: unknown }[];
}

export async function createItem(app: McpApp, input: CreateItemInput): Promise<HubItem> {
  const payload = await callTool(app, 'mcpapp.lists.createItem', {
    listId: input.listId, title: input.name, ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.parentId ? { parentId: input.parentId } : {}), customFields: input.customFields,
  });
  const created = hubItem(object(payload)?.item ?? payload);
  if (created.stageId !== input.stageId) await callTool(app, 'mcpapp.lists.moveItemToStage', { itemId: created._id, stageId: input.stageId });
  const readback = await callTool(app, 'mcpapp.lists.getItem', { itemId: created._id });
  const item = hubItem(object(readback)?.item ?? readback);
  if (item._id !== created._id) throw new Error('HUB_ITEM_ID_MISMATCH');
  if (item.stageId !== input.stageId) throw new Error('HUB_ITEM_STAGE_MISMATCH');
  if (input.parentId && item.parentId !== input.parentId) throw new Error('HUB_ITEM_PARENT_MISMATCH');
  return item;
}

export async function updateItem(app: McpApp, input: { itemId: string; name?: string; description?: string; stageId?: string; customFields?: { fieldId: string; value: unknown }[] }): Promise<void> {
  const raw = await callTool(app, 'mcpapp.lists.getItem', { itemId: input.itemId });
  const current = hubItem(object(raw)?.item ?? raw);
  if (current._id !== input.itemId) throw new Error('HUB_ITEM_READBACK_MISMATCH');
  const existing = fieldsOf(current.customFields);
  const patch = input.customFields ?? [];
  const patchIds = new Set(patch.map((field) => field.fieldId));
  await callTool(app, 'mcpapp.lists.updateItem', {
    itemId: input.itemId, ...(input.name !== undefined ? { title: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    customFields: [...existing.filter((field) => !patchIds.has(field.fieldId)), ...patch],
  });
  if (input.stageId && input.stageId !== current.stageId) await callTool(app, 'mcpapp.lists.moveItemToStage', { itemId: input.itemId, stageId: input.stageId });
}

export async function deleteItem(app: McpApp, itemId: string): Promise<void> {
  await callTool(app, 'mcpapp.lists.deleteItem', { itemId });
}

export async function listAllItems(app: McpApp, listId: string): Promise<{ items: HubItem[]; capped: boolean }> {
  try {
    const items: HubItem[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      pages += 1;
      if (pages > MAX_PAGES) throw new Error('ITEM_PAGING_RUNAWAY');
      const requestedCursor = cursor;
      const body = await restCall<{ items?: HubItem[]; nextCursor?: string | null }>(app, 'POST', 'items.query', {
        body: { listId, sort: { field: 'order', direction: 1 }, count: PAGE, ...(cursor ? { cursor } : {}) },
      });
      items.push(...(Array.isArray(body.items) ? body.items : []));
      const nextCursor = body.nextCursor ?? undefined;
      if (nextCursor !== undefined && nextCursor === requestedCursor) throw new Error('ITEM_PAGING_RUNAWAY');
      cursor = nextCursor;
    } while (cursor);
    return { items, capped: false };
  } catch (err) {
    if (!(err instanceof OptionalFeatureUnavailableError)) throw err;
    const body = await restCall<{ items?: HubItem[]; truncated?: boolean }>(app, 'GET', 'items.listByListId', { query: { listId } });
    return { items: Array.isArray(body.items) ? body.items : [], capped: Boolean(body.truncated) };
  }
}
