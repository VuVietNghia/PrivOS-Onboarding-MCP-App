import { fileMatches } from './p0-contracts';

type Field = { fieldId: string; value: unknown };
export type Snapshot = { itemId: string; itemKey: string; fields: Field[] };

function record(value: unknown): Record<string, unknown> | undefined {
  // A checked object can be indexed by its string keys at the SDK boundary.
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseSnapshot(statusCode: number, body: unknown, itemId: string, itemKey: string): Snapshot | undefined {
  const page = record(body);
  if (statusCode >= 400 || page?.success !== true || page.count !== 1 || page.nextCursor !== null || !Array.isArray(page.items) || page.items.length !== 1) return undefined;
  const item = record(page.items[0]);
  if (item?._id !== itemId || item.key !== itemKey || !Array.isArray(item.customFields)) return undefined;
  const fields: Field[] = [];
  for (const raw of item.customFields) {
    const field = record(raw);
    if (typeof field?.fieldId !== 'string' || !('value' in field)) return undefined;
    fields.push({ fieldId: field.fieldId, value: field.value });
  }
  return { itemId, itemKey, fields };
}

function write(snapshot: Snapshot, fieldId: string, value: string) {
  if (!snapshot.fields.some((field) => field.fieldId === fieldId)) return undefined;
  return { itemId: snapshot.itemId,
    customFields: [...snapshot.fields.filter((field) => field.fieldId !== fieldId), { fieldId, value }],
  };
}

export function buildTextWrite(snapshot: Snapshot, fieldId: string, bytes: number) {
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > 8192) return undefined;
  return write(snapshot, fieldId, 'x'.repeat(bytes));
}

export function buildScoreWrite(snapshot: Snapshot, fieldId: string, marker: string, score: number, maxBytes = 8192) {
  if (!/^[a-z0-9_-]{1,32}$/i.test(marker) || !Number.isInteger(score) || score < 0 || score > 100 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 8192) return undefined;
  const source = snapshot.fields.find((field) => field.fieldId === fieldId)?.value;
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 8192) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { return undefined; }
  const scores = record(parsed);
  if (!scores || (scores.p0ProbeScores !== undefined && !record(scores.p0ProbeScores))) return undefined;
  const current = record(scores.p0ProbeScores) ?? {};
  const value = JSON.stringify({ ...scores, p0ProbeScores: { ...current, [marker]: score } });
  if (new TextEncoder().encode(value).length > maxBytes) return undefined;
  return write(snapshot, fieldId, value);
}

export function searchRequest(listId: string, text: string) {
  if (!listId.trim() || !text.trim() || text.length > 80) throw new Error('Invalid search target');
  return { method: 'POST' as const, path: 'items.query', body: { listId, filter: { text }, count: 20, fields: ['name', 'key'] } };
}

export function snapshotQueryRequest(listId: string, itemKey: string) {
  return { method: 'POST' as const, path: 'items.query', body: { listId,
    filter: { customFields: [{ fieldId: 'key', op: 'is', value: itemKey }] }, count: 1,
    fields: ['name', 'key', 'customFields'],
  } };
}

export function pageQueryRequest(listId: string, count: number, cursor?: string) {
  if (!listId.trim() || !Number.isInteger(count) || count < 1 || count > 200) throw new Error('Invalid page target');
  return { method: 'POST' as const, path: 'items.query', body: { listId, count,
    fields: ['name', 'key', 'parentId', 'stageId'], ...(cursor ? { cursor } : {}),
  } };
}

export function parsePage(statusCode: number, body: unknown, requestedCount: number): { ids: string[]; nextCursor?: string } | undefined {
  const page = record(body);
  if (statusCode >= 400 || page?.success !== true || !Array.isArray(page.items) ||
    !Number.isInteger(page.count) || page.count !== page.items.length || page.items.length > requestedCount ||
    !(page.nextCursor === null || typeof page.nextCursor === 'string')) return undefined;
  const ids: string[] = [];
  for (const raw of page.items) {
    const id = record(raw)?._id;
    if (typeof id !== 'string' || !id || ids.includes(id)) return undefined;
    ids.push(id);
  }
  return { ids, ...(typeof page.nextCursor === 'string' ? { nextCursor: page.nextCursor } : {}) };
}

export function pageAdvanceValid(
  page: { ids: readonly string[]; nextCursor?: string }, seenIds: readonly string[], seenCursors: readonly string[], currentCursor?: string,
): boolean {
  if (currentCursor && page.ids.some((id) => seenIds.includes(id))) return false;
  if (page.nextCursor && (!page.ids.length || seenCursors.includes(page.nextCursor))) return false;
  return true;
}

export function approvedFileSize(bytes: number, approvedKiB: number, mimeType: string): boolean {
  return Number.isInteger(bytes) && bytes > 0 && Number.isInteger(approvedKiB) && approvedKiB >= 1 && approvedKiB <= 8192 &&
    bytes <= approvedKiB * 1024 && bytes <= 8192 * 1024 &&
    ['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType);
}

export function fileSizeVerified(statusCode: number, body: unknown, expectedBytes: number): boolean {
  const envelope = record(body);
  const file = record(envelope?.file);
  return statusCode < 400 && envelope?.success === true && Number.isInteger(expectedBytes) && expectedBytes > 0 &&
    file?.file_size === expectedBytes;
}

export function verifiedUploadFileId(
  uploadedId: string | undefined, statusCode: number, body: unknown, roomId: string, folderId: string,
): string | undefined {
  return uploadedId && fileMatches(statusCode, body, uploadedId, roomId, folderId) ? uploadedId : undefined;
}
