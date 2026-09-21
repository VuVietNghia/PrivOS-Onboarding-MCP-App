// src/ui/onboarding/data/onboarding-lists.ts
import type { McpApp } from '@privos_ai/app-react';
import { OptionalFeatureUnavailableError, PrivosRestError, restCall } from '../../privos-rest';
import type { FieldDef, FieldSpec, HubItem } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';

export interface HubList { _id: string; name: string; key?: string; isolatedList?: boolean; fieldDefinitions?: FieldDef[] }

const PAGE = 200;
const MAX_PAGES = 1000;

export async function listRoomLists(app: McpApp, roomId: string): Promise<HubList[]> {
  const body = await restCall<{ lists?: HubList[] }>(app, 'GET', 'lists.listByRoomId', { query: { roomId } });
  return Array.isArray(body.lists) ? body.lists : [];
}

export async function getListInfo(app: McpApp, listId: string): Promise<{ list: HubList; stages: StageRef[] }> {
  const body = await restCall<{ list: HubList; stages?: StageRef[] }>(app, 'GET', 'lists.info', { query: { listId } });
  return { list: body.list, stages: Array.isArray(body.stages) ? body.stages : [] };
}

export interface CreateListInput {
  roomId: string; name: string; key: string; fields: FieldSpec[];
  stages: { name: string; order: number }[]; isolated: boolean;
}

export async function createList(app: McpApp, input: CreateListInput): Promise<HubList> {
  // Spike Q3 = Không nhận isolatedList: thay dòng restCall dưới bằng
  // app.callServerTool({ name: 'mcpapp.lists.create', arguments: { roomId, name, key, isolatedList, fieldDefinitions, stages } })
  // rồi đọc result.list (xem assignee-demo-panel.tsx).
  const body = await restCall<{ list: HubList }>(app, 'POST', 'lists.create', {
    body: {
      roomId: input.roomId,
      name: input.name,
      key: input.key,
      isolatedList: input.isolated,
      fieldDefinitions: input.fields.map((f) => ({ name: f.name, type: f.type, ...(f.options ? { options: f.options.map((value) => ({ value })) } : {}) })),
      stages: input.stages,
    },
  });
  return body.list;
}

export async function renameList(app: McpApp, listId: string, name: string): Promise<void> {
  await restCall(app, 'POST', 'lists.update', { body: { listId, name } });
}

export async function deleteList(app: McpApp, listId: string): Promise<boolean> {
  try {
    await restCall(app, 'POST', 'lists.delete', { body: { listId } });
    return true;
  } catch (err) {
    // 404 (list/route không tồn tại), 405 (route không được host hỗ trợ) và 403
    // (OptionalFeatureUnavailableError — thiếu quyền optional) đều coi là "route
    // không dùng được": Hub thật hay trả 403/405 thay vì 404 trong tình huống
    // này, và spike Q4 chưa chạy nên không được giả định chỉ có 404.
    if (err instanceof PrivosRestError && (err.statusCode === 404 || err.statusCode === 405)) return false;
    if (err instanceof OptionalFeatureUnavailableError) return false;
    throw err;
  }
}

export interface CreateItemInput {
  listId: string; name: string; stageId: string; parentId?: string;
  customFields: { fieldId: string; value: unknown }[];
}

export async function createItem(app: McpApp, input: CreateItemInput): Promise<HubItem> {
  const body = await restCall<{ item: HubItem }>(app, 'POST', 'items.create', {
    body: {
      listId: input.listId, name: input.name, stageId: input.stageId,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      customFields: input.customFields,
    },
  });
  // Spike Q2 = Không: Hub bỏ qua customFields khi tạo. Khi đó bỏ comment 2 dòng dưới.
  // if (input.customFields.length) await updateItem(app, { itemId: body.item._id, customFields: input.customFields });
  // return { ...body.item, customFields: input.customFields };
  return body.item;
}

export async function updateItem(app: McpApp, input: { itemId: string; name?: string; stageId?: string; customFields?: { fieldId: string; value: unknown }[] }): Promise<void> {
  await restCall(app, 'POST', 'items.update', { body: input });
}

export async function deleteItem(app: McpApp, itemId: string): Promise<void> {
  await restCall(app, 'POST', 'items.delete', { body: { itemId } });
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
