export type ProbeResult =
  | { id: string; state: 'not-run' }
  | { id: string; state: 'pass'; evidence: string; checkedAt: string }
  | { id: string; state: 'fail'; evidence: string; checkedAt: string };

export function allPassed(results: readonly ProbeResult[]): boolean {
  return results.length > 0 && results.every((result) => result.state === 'pass');
}

export interface ProbeSessionSnapshot {
  generation: number;
  consent: boolean;
  nextCursor: string | undefined;
  preview: string;
  capture: string;
  results: ProbeResult[];
}

export function invalidateProbeSession(current: ProbeSessionSnapshot): ProbeSessionSnapshot {
  return {
    generation: current.generation + 1,
    consent: false,
    nextCursor: undefined,
    preview: '',
    capture: '',
    results: current.results.map((result) => ({ id: result.id, state: 'not-run' })),
  };
}

const visibleFieldTypes = new Set(['DATE', 'CHECKBOX', 'SELECT', 'ASSIGNEE', 'FILE_MULTIPLE']);
const visibleKeys = new Set(['success', 'list', 'lists', 'items', 'item', 'file', 'stages', 'fieldDefinitions', 'customFields', 'options', 'type', 'name', 'key', '_id', 'id', 'listId', 'itemId', 'fileId', 'roomId', 'stageId', 'parentId', 'fieldId', 'isolatedList', 'value', 'count', 'nextCursor', 'cursor', 'statusCode', 'errorType', 'method', 'path', 'query', 'body', 'request', 'operation', 'target', 'readback', 'filter', 'fields', 'order', 'channelId', 'fileName', 'base64Data', 'duplicateAction', 'op']);

export function sanitizeProbeData(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeProbeData);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry], index) => [visibleKeys.has(key) ? key : `[field-${index + 1}]`,
      key === 'type' && typeof entry === 'string' && visibleFieldTypes.has(entry) ? entry : sanitizeProbeData(entry),
    ]));
  }
  if (typeof value === 'string') return '[string]';
  if (typeof value === 'number') return '[number]';
  if (typeof value === 'boolean') return '[boolean]';
  return value;
}

export type ProbeOperation = 'list-create' | 'list-info' | 'item-create' | 'items-query' | 'item-lookup' | 'field-update' | 'file-info' | 'file-upload';
export type ParentFilter = { mode: 'any' } | { mode: 'root' } | { mode: 'children'; parentId: string };
export interface ProbeContext {
  listId?: string;
  listKey?: string;
  itemKey?: string;
  stageId?: string;
  parentId?: string | null;
  fieldId?: string;
  assigneeId?: string;
  fileId?: string;
  fields?: readonly string[];
}

export const queryFields = ['name', 'key', 'stageId', 'parentId', 'customFields'] as const;

export function buildQueryRequest(listId: string, stageId: string, parent: ParentFilter, cursor?: string) {
  return { method: 'POST' as const, path: 'items.query', body: {
    listId,
    filter: { ...(stageId ? { stageId } : {}), ...(parent.mode === 'root' ? { parentId: null } : parent.mode === 'children' ? { parentId: parent.parentId } : {}) },
    count: 20,
    ...(cursor ? { cursor } : {}),
    fields: [...queryFields],
  } };
}

function get(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? Object.entries(value).find(([entryKey]) => entryKey === key)?.[1] : undefined;
}

function hasId(value: unknown): value is { _id: string } {
  return typeof get(value, '_id') === 'string' && get(value, '_id') !== '';
}

function validPage(body: unknown): boolean {
  const items = get(body, 'items');
  return get(body, 'success') === true && Array.isArray(items) && get(body, 'count') === items.length &&
    typeof get(body, 'nextCursor') !== 'undefined' &&
    (get(body, 'nextCursor') === null || typeof get(body, 'nextCursor') === 'string');
}

export function nextPageCursor(body: unknown): string | undefined {
  const cursor = get(body, 'nextCursor');
  return validPage(body) && typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}

function validListInfo(body: unknown, expectedId: string | undefined, expectedKey: string | undefined): boolean {
  const list = get(body, 'list');
  const defs = get(list, 'fieldDefinitions');
  const stages = get(body, 'stages');
  return get(body, 'success') === true && hasId(list) && (!expectedId || list._id === expectedId) && (!expectedKey || get(list, 'key') === expectedKey) &&
    get(list, 'isolatedList') === true && Array.isArray(defs) &&
    [...visibleFieldTypes].every((type) => defs.some((field) => get(field, 'type') === type)) &&
    Array.isArray(stages) && stages.length > 0 && stages.every(hasId);
}

function matchingItem(item: unknown, context: ProbeContext): boolean {
  const fields = get(item, 'customFields');
  return hasId(item) && (!context.itemKey || get(item, 'key') === context.itemKey || get(item, 'name') === context.itemKey) &&
    (!context.stageId || get(item, 'stageId') === context.stageId) &&
    (context.parentId === undefined || (get(item, 'parentId') ?? null) === context.parentId) &&
    (!context.fieldId || !context.assigneeId || (Array.isArray(fields) && fields.some((field) => get(field, 'fieldId') === context.fieldId && get(field, 'value') === context.assigneeId)));
}

export function validateProbeResponse(id: ProbeOperation, body: unknown, context: ProbeContext): boolean {
  if (get(body, 'success') !== true) return false;
  switch (id) {
    case 'list-create': {
      const created = get(body, 'list');
      return hasId(created) && validListInfo(get(body, 'readback'), created._id, context.listKey);
    }
    case 'list-info': return validListInfo(body, context.listId, context.listKey);
    case 'item-create': {
      const created = get(body, 'item');
      const readback = get(body, 'readback');
      const items = get(readback, 'items');
      return hasId(created) && validPage(readback) && Array.isArray(items) && items.length === 1 &&
        matchingItem(items[0], context) && get(items[0], '_id') === created._id;
    }
    case 'items-query': {
      const items = get(body, 'items');
      const allowed = new Set(['_id', ...(context.fields ?? queryFields)]);
      return validPage(body) && Array.isArray(items) && items.length > 0 && items.every((item) => {
        if (!hasId(item) || item === null || typeof item !== 'object') return false;
        if (context.stageId && get(item, 'stageId') !== context.stageId) return false;
        if (context.parentId !== undefined && (get(item, 'parentId') ?? null) !== context.parentId) return false;
        return Object.keys(item).every((key) => allowed.has(key)) && (context.fields ?? queryFields).every((key) => key in item);
      });
    }
    case 'item-lookup': {
      const items = get(body, 'items');
      return validPage(body) && Array.isArray(items) && items.length === 1 && matchingItem(items[0], context);
    }
    case 'field-update': {
      const items = get(body, 'items');
      return validPage(body) && Array.isArray(items) && items.length === 1 && matchingItem(items[0], context);
    }
    case 'file-info': return hasId(get(body, 'file')) && get(get(body, 'file'), '_id') === context.fileId;
    case 'file-upload': return hasId(get(body, 'file'));
  }
}
