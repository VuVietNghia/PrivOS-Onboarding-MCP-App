import { queryFields } from './probe-results';
import type { McpApp } from '@privos_ai/app-react';
import { createList, listRoomLists } from '../data/onboarding-lists';
import { idOf, unwrapToolResult } from '../data/tool-result';
import { registryListInput } from '../domain/v2-registry-schema';

function data(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export async function createRegistryIfVacant(app: McpApp, roomId: string, kind: 'positions' | 'hires'):
  Promise<{ status: 'collision' } | { status: 'created'; listId: string }> {
  if (!roomId.trim()) throw new Error('REGISTRY_ROOM_REQUIRED');
  const input = registryListInput(roomId, kind);
  const lists = await listRoomLists(app, roomId);
  if (lists.some((list) => list.key === input.key || list.name === input.name)) return { status: 'collision' };
  const created = await createList(app, input);
  return { status: 'created', listId: created._id };
}

export function actorAllowed(actor: 'B' | 'C', userId: string | undefined, admin: boolean, bUserId: string, cUserId: string): boolean {
  return Boolean(userId && !admin && bUserId && cUserId && bUserId !== cUserId && userId === (actor === 'B' ? bUserId : cUserId));
}

export function assigneeIncludes(value: unknown, userId: string): boolean {
  if (!userId) return false;
  if (typeof value === 'string') return value === userId;
  if (Array.isArray(value)) return value.some((entry) => assigneeIncludes(entry, userId));
  const person = data(value);
  return Boolean(person && (person._id === userId || person.id === userId));
}

export function queryMatches(statusCode: number, body: unknown, itemKey: string, itemId?: string): boolean {
  const page = data(body);
  if (statusCode >= 400 || page?.success !== true || !Array.isArray(page.items) || page.items.length !== 1 || page.count !== 1) return false;
  const item = data(page.items[0]);
  return Boolean(item && typeof item._id === 'string' && item._id && item.key === itemKey && (!itemId || item._id === itemId));
}

export function updateMatches(writeStatus: number, writeBody: unknown, readStatus: number, readBody: unknown, itemKey: string, itemId: string, fieldId: string, value: unknown): boolean {
  if (writeStatus >= 400 || data(writeBody)?.success !== true || !queryMatches(readStatus, readBody, itemKey, itemId)) return false;
  const page = data(readBody);
  const item = data((page?.items as unknown[])[0]);
  const fields = item?.customFields;
  return Array.isArray(fields) && fields.some((field) => data(field)?.fieldId === fieldId && data(field)?.value === value);
}

export function ordinaryField(definitions: readonly { _id: string; type: string }[], fieldId: string): boolean {
  return definitions.some((field) => field._id === fieldId && (field.type === 'TEXT' || field.type === 'TEXTAREA'));
}

export function folderMatches(root: unknown, child: unknown, roomId: string, positionId: string): boolean {
  const parent = data(root); const position = data(child);
  return Boolean(parent && position && parent._id && parent.name === 'Onboarding' && (parent.father === null || parent.father === undefined) &&
    parent.channel_id === roomId && position._id && position.name === positionId && position.father === parent._id && position.channel_id === roomId);
}

// The documented folder model has no itemId. This only succeeds if a live Hub
// response adds an explicit owner relation; otherwise the move stays gated.
export function itemFolderMatches(folder: unknown, roomId: string, folderId: string, itemId: string): boolean {
  const metadata = data(folder);
  return Boolean(metadata && metadata._id === folderId && metadata.channel_id === roomId && metadata.itemId === itemId);
}

export function fileMatches(statusCode: number, body: unknown, fileId: string, roomId: string, folderId: string): boolean {
  const envelope = data(body); const file = data(envelope?.file);
  return statusCode < 400 && envelope?.success === true && file?._id === fileId && file.channel_id === roomId && file.folder_id === folderId;
}

export function aclQuery(listId: string, itemKey: string) {
  return { name: 'mcpapp.lists.queryItems', arguments: { listId,
    filter: { customFields: [{ fieldId: 'key', op: 'is', value: itemKey }] }, count: 1, fields: [...queryFields],
  } };
}

export function aclUpdate(itemId: string, customFields: readonly { fieldId: string; value: unknown }[]) {
  return { name: 'mcpapp.lists.updateItem', arguments: { itemId, customFields: [...customFields] } };
}

export type AclVerdict = 'pass' | 'expected-negative' | 'unclassified-denial' | 'fail';

export function hiddenTargetVerdict(verdict: AclVerdict): 'fail' | 'unclassified-target' {
  return verdict === 'fail' || verdict === 'pass' ? 'fail' : 'unclassified-target';
}

export function classifyAclResult(expectation: 'allow' | 'deny', statusCode: number, body: unknown, itemKey?: string, itemId?: string): AclVerdict {
  if (statusCode === 403) return expectation === 'deny' ? 'unclassified-denial' : 'fail';
  if (statusCode >= 400 || body === null || typeof body !== 'object' || !('success' in body) || body.success !== true) return 'fail';
  const items = 'items' in body ? body.items : undefined;
  if (!Array.isArray(items)) return 'fail';
  if (expectation === 'deny') return items.length === 0 && 'count' in body && body.count === 0 && 'nextCursor' in body && body.nextCursor === null ? 'expected-negative' : 'fail';
  return itemKey && queryMatches(statusCode, body, itemKey, itemId) ? 'pass' : 'fail';
}

export function createFolderRequest(roomId: string, name: string, fatherId?: string) {
  return { name: 'mcpapp.folders.create', arguments: { name, channelId: roomId, ...(fatherId ? { parentId: fatherId } : {}) } };
}

export function moveFileRequest(fileId: string, folderId: string) {
  return { name: 'mcpapp.files.update', arguments: { fileId, folderId } };
}

export function uploadFileParams(channelId: string, folderId: string, fileName: string, base64Data: string) {
  return { channelId, folderId, fileName, base64Data, duplicateAction: 'keep_both' as const };
}

export function uploadResultId(result: unknown): string | undefined {
  const envelope = data(result);
  if (envelope?.success === false) return undefined;
  return idOf(envelope?.file ?? data(envelope?.message)?.file ?? envelope);
}

async function folderListing(app: McpApp, roomId: string, parentId?: string): Promise<unknown[]> {
  const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.folders.getByChannel',
    arguments: { channelId: roomId, limit: 100, ...(parentId ? { parentId } : {}) } }));
  const folders = Array.isArray(payload) ? payload : data(payload)?.folders;
  if (!Array.isArray(folders)) throw new Error('HUB_FOLDER_LIST_MALFORMED');
  return folders;
}

export async function createVerifiedFolder(
  app: McpApp, roomId: string, name: string, fatherId?: string,
): Promise<{ ok: true; folderId: string } | { ok: false; reason: 'invalid-room' | 'invalid-parent' | 'create-failed' | 'readback-mismatch' }> {
  if (!roomId.trim() || !name.trim()) return { ok: false, reason: 'invalid-room' };
  if (fatherId) {
    const roots = await folderListing(app, roomId);
    if (!roots.some((folder) => idOf(folder) === fatherId && data(folder)?.name === 'Onboarding')) return { ok: false, reason: 'invalid-parent' };
  }
  const before = await folderListing(app, roomId, fatherId);
  const existing = before.find((folder) => data(folder)?.name === name);
  const existingId = idOf(existing);
  if (existingId) return { ok: true, folderId: existingId };
  const created = unwrapToolResult(await app.callServerTool(createFolderRequest(roomId, name, fatherId)));
  const folderId = idOf(data(created)?.folder ?? created);
  if (!folderId) return { ok: false, reason: 'create-failed' };
  const after = await folderListing(app, roomId, fatherId);
  return after.some((folder) => idOf(folder) === folderId && data(folder)?.name === name)
    ? { ok: true, folderId } : { ok: false, reason: 'readback-mismatch' };
}

export function fileLocation(file: { folder_id?: string | null; channel_id?: string }, roomId: string, roomFolderId: string, itemFolderId: string): 'room-folder' | 'item-folder' | 'other' {
  if (file.channel_id !== roomId) return 'other';
  if (file.folder_id === roomFolderId) return 'room-folder';
  if (file.folder_id === itemFolderId) return 'item-folder';
  return 'other';
}
