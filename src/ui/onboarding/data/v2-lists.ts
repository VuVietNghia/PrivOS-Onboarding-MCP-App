import type { McpApp } from '@privos_ai/app-react';
import { z } from 'zod';
import { OnboardingError } from '../domain/errors';
import type { FieldDef, HubItem } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';
import { normalizeHubItem } from '../domain/v2-schemas';
import { getIsolatedListViaTool } from './isolated-lists';
import { idOf, unwrapToolResult } from './tool-result';
import { PrivosRestError } from '../../privos-rest';

const querySchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable().optional() });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function readListInfo(app: McpApp, listId: string): Promise<{ list: { _id: string; name: string; roomId: string; fieldDefinitions: FieldDef[] }; stages: StageRef[] }> {
  if (!listId) throw new OnboardingError('ROOM_NOT_CONFIGURED');
  const detail = await getIsolatedListViaTool(app, listId);
  if (!detail.isolatedList) throw new OnboardingError('SCHEMA_DRIFT');
  return { list: { _id: detail._id, name: detail.name, roomId: detail.roomId, fieldDefinitions: detail.fieldDefinitions }, stages: detail.stages };
}

export interface ItemQueryFilter {
  stageId?: string;
  parentId?: string | null;
  archived?: boolean;
  customFields?: readonly { fieldId: string; op: 'contains' | 'is'; value: string }[];
}

export async function queryItems(
  app: McpApp, listId: string, filter: ItemQueryFilter,
  count: number, cursor?: string,
): Promise<{ items: HubItem[]; nextCursor: string | null }> {
  if (!listId) throw new OnboardingError('ROOM_NOT_CONFIGURED');
  const response: unknown = await app.callServerTool({ name: 'mcpapp.lists.queryItems', arguments: {
    listId, filter, sort: { field: 'order', direction: 1 }, count,
    fields: ['name', 'description', 'stageId', 'parentId', 'customFields'], ...(cursor ? { cursor } : {}),
  } });
  let payload: unknown;
  try { payload = unwrapToolResult(response); }
  catch (error) {
    if (error instanceof PrivosRestError && error.code === 'error-invalid-cursor') throw new OnboardingError('PAGINATION_INVALID');
    throw error;
  }
  const root = record(payload);
  const parsed = querySchema.safeParse(root?.data ?? payload);
  if (!parsed.success) throw new OnboardingError('SCHEMA_DRIFT');
  return { items: parsed.data.items.map((item): HubItem => normalizeHubItem(item)), nextCursor: parsed.data.nextCursor ?? null };
}

export async function readAllItems(app: McpApp, listId: string): Promise<HubItem[]> {
  const items = new Map<string, HubItem>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await queryItems(app, listId, {}, 200, cursor);
    for (const item of page.items) {
      if (items.has(item._id)) throw new OnboardingError('SCHEMA_DRIFT');
      items.set(item._id, item);
    }
    const next = page.nextCursor;
    if (next && seen.has(next)) throw new OnboardingError('PAGINATION_INVALID');
    if (next) seen.add(next);
    cursor = next ?? undefined;
  } while (cursor);
  return [...items.values()];
}

export async function readItem(app: McpApp, listId: string, itemId: string): Promise<HubItem> {
  if (!listId || !itemId) throw new OnboardingError('ROOM_NOT_CONFIGURED');
  const response: unknown = await app.callServerTool({ name: 'mcpapp.lists.getItem', arguments: { itemId } });
  const payload = unwrapToolResult(response);
  const root = record(payload);
  const raw = record(root?.item) ?? root;
  if (!raw || idOf(raw) !== itemId || (raw.listId !== undefined && raw.listId !== listId)) throw new OnboardingError('SCHEMA_DRIFT');
  return normalizeHubItem(raw);
}

export async function patchFields(app: McpApp, listId: string, itemId: string, changes: Readonly<Record<string, unknown>>): Promise<void> {
  const before = await readItem(app, listId, itemId);
  const fields = new Map((before.customFields ?? []).map((field) => [field.fieldId, field.value]));
  if (Object.values(changes).some((value) => value === null)) {
    const detail = await readListInfo(app, listId);
    const fileIds = new Set(detail.list.fieldDefinitions.filter((field) => /^(FILE|DOCUMENT)/.test(field.type)).map((field) => field._id));
    if (Object.entries(changes).some(([fieldId, value]) => value === null && fileIds.has(fieldId))) throw new OnboardingError('SCHEMA_DRIFT');
  }
  for (const [fieldId, value] of Object.entries(changes)) {
    if (!fieldId) throw new OnboardingError('SCHEMA_DRIFT');
    fields.set(fieldId, value);
  }
  const customFields = [...fields].map(([fieldId, value]) => ({ fieldId, value }));
  const response: unknown = await app.callServerTool({ name: 'mcpapp.lists.updateItem', arguments: { itemId, customFields } });
  unwrapToolResult(response);
  const after = await readItem(app, listId, itemId);
  for (const [fieldId, value] of fields) {
    const actual = after.customFields?.find((field) => field.fieldId === fieldId);
    if (!actual || JSON.stringify(actual.value) !== JSON.stringify(value)) throw new OnboardingError('SCHEMA_DRIFT');
  }
}
