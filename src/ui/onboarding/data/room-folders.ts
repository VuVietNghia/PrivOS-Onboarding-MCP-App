import type { McpApp } from '@privos_ai/app-react';
import { idOf, unwrapToolResult } from './tool-result';

interface Folder { id: string; name: string; roomId: string; parentId: string | null }
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const inFlight = new WeakMap<McpApp, Map<string, Promise<{ rootFolderId: string; positionFolderId: string }>>>();

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseFolder(value: unknown): Folder {
  const source = record(value);
  const id = idOf(source);
  const roomId = source?.channel_id ?? source?.channelId;
  const parentId = source?.father ?? source?.parentId ?? source?.parent_id ?? null;
  if (!id || typeof source?.name !== 'string' || typeof roomId !== 'string' ||
      (parentId !== null && typeof parentId !== 'string')) throw new Error('FILE_LOCATION_INVALID');
  return { id, name: source.name, roomId, parentId };
}

async function listFolders(app: McpApp, roomId: string, parentId: string | null): Promise<Folder[]> {
  const folders: Folder[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.folders.getByChannel',
      arguments: { channelId: roomId, limit: PAGE_SIZE, ...(page ? { skip: page * PAGE_SIZE } : {}),
        ...(parentId ? { parentId } : {}) } }));
    const batch = Array.isArray(payload) ? payload : record(payload)?.folders;
    if (!Array.isArray(batch)) throw new Error('HUB_FOLDER_LIST_MALFORMED');
    for (const raw of batch) {
      const folder = parseFolder(raw);
      if (folder.roomId !== roomId || folder.parentId !== parentId) throw new Error('FILE_LOCATION_INVALID');
      folders.push(folder);
    }
    if (batch.length < PAGE_SIZE) return folders;
  }
  throw new Error('HUB_FOLDER_LIST_PAGING_LIMIT');
}

async function ensureChild(app: McpApp, roomId: string, name: string, parentId: string | null): Promise<string> {
  const matching = (await listFolders(app, roomId, parentId)).filter((folder) => folder.name === name);
  if (matching.length > 1) throw new Error('FOLDER_CONFLICT');
  if (matching.length === 1) return matching[0].id;

  let createdId: string | undefined;
  try {
    const created = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.folders.create',
      arguments: { channelId: roomId, name, ...(parentId ? { parentId } : {}) } }));
    createdId = idOf(record(created)?.folder ?? created);
  } catch {
    // A lost create response may still mean the folder exists. Reconcile before retrying.
    const readback = (await listFolders(app, roomId, parentId)).filter((folder) => folder.name === name);
    if (readback.length > 1) throw new Error('FOLDER_CONFLICT');
    if (readback.length === 1) return readback[0].id;
    throw new Error('FOLDER_CREATE_UNCONFIRMED');
  }
  const readback = (await listFolders(app, roomId, parentId)).filter((folder) => folder.name === name);
  if (readback.length > 1) throw new Error('FOLDER_CONFLICT');
  if (readback.length !== 1 || (createdId && readback[0].id !== createdId)) throw new Error('FILE_LOCATION_INVALID');
  return readback[0].id;
}

export function ensurePositionFolder(app: McpApp, roomId: string, positionItemId: string): Promise<{ rootFolderId: string; positionFolderId: string }> {
  if (!roomId.trim() || !positionItemId.trim()) return Promise.reject(new Error('FILE_LOCATION_INVALID'));
  let appCache = inFlight.get(app);
  if (!appCache) { appCache = new Map(); inFlight.set(app, appCache); }
  const key = `${roomId}\u0000${positionItemId}`;
  const existing = appCache.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const rootFolderId = await ensureChild(app, roomId, 'Onboarding', null);
    const positionFolderId = await ensureChild(app, roomId, positionItemId, rootFolderId);
    return { rootFolderId, positionFolderId };
  })();
  appCache.set(key, promise);
  void promise.catch(() => appCache?.delete(key));
  return promise;
}

export async function isVerifiedPositionFolder(app: McpApp, roomId: string, folderId: string): Promise<boolean> {
  const roots = (await listFolders(app, roomId, null)).filter((folder) => folder.name === 'Onboarding');
  if (roots.length > 1) throw new Error('FOLDER_CONFLICT');
  if (roots.length !== 1) return false;
  const children = await listFolders(app, roomId, roots[0].id);
  return children.some((folder) => folder.id === folderId);
}
