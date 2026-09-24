import type { McpApp } from '@privos_ai/app-react';
import type { FileRef } from '../domain/models';
import { ensurePositionFolder, isVerifiedPositionFolder } from './room-folders';
import { idOf, unwrapToolResult } from './tool-result';

export interface FileMetadata extends FileRef {
  roomId: string;
  folderId: string;
  downloadUrl?: string;
  raw: Record<string, unknown>;
}

export interface FilesGateway {
  folder(positionItemId: string): Promise<string>;
  upload(positionItemId: string, file: File): Promise<FileMetadata>;
  metadata(fileId: string): Promise<FileMetadata>;
  open(fileId: string, intent: 'view' | 'download'): Promise<void>;
  move(fileId: string, folderId: string, sourceItemId?: string): Promise<void>;
}

const MAX_DIRECT_SIZE = 100 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 20_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseMetadata(value: unknown): FileMetadata {
  const raw = record(value);
  const id = idOf(raw);
  const roomId = raw?.channel_id ?? raw?.channelId;
  const folderId = raw?.folder_id ?? raw?.folderId;
  if (!raw || !id || typeof roomId !== 'string' || typeof folderId !== 'string') throw new Error('FILE_LOCATION_INVALID');
  const name = typeof raw.name === 'string' && raw.name ? raw.name : id;
  const mime = raw.file_type ?? raw.fileType ?? raw.mimeType;
  const url = raw.downloadUrl ?? raw.download_url;
  return { id, name, roomId, folderId, raw,
    ...(typeof mime === 'string' ? { mimeType: mime } : {}),
    ...(typeof url === 'string' ? { downloadUrl: url } : {}) };
}

async function dataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(chunks.join(''))}`;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('FILE_UPLOAD_TIMEOUT')), UPLOAD_TIMEOUT_MS);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export function createFilesGateway(app: McpApp, roomId: string): FilesGateway {
  if (!roomId.trim()) throw new Error('FILE_LOCATION_INVALID');

  async function metadata(fileId: string): Promise<FileMetadata> {
    if (!fileId.trim()) throw new Error('FILE_REF_INVALID');
    const payload = unwrapToolResult(await app.callServerTool({ name: 'mcpapp.files.get', arguments: { fileId } }));
    const result = parseMetadata(record(payload)?.file ?? payload);
    if (result.id !== fileId || result.roomId !== roomId) throw new Error('FILE_LOCATION_INVALID');
    return result;
  }

  return {
    folder: async (positionItemId) => (await ensurePositionFolder(app, roomId, positionItemId)).positionFolderId,
    upload: async (positionItemId, file) => {
      if (!file.name || file.size > MAX_DIRECT_SIZE) throw new Error('FILE_UPLOAD_UNSUPPORTED');
      const folderId = (await ensurePositionFolder(app, roomId, positionItemId)).positionFolderId;
      const payload: unknown = await withTimeout(app.uploadFile({ channelId: roomId, folderId,
        fileName: file.name, base64Data: await dataUrl(file), mimeType: file.type || 'application/octet-stream',
        duplicateAction: 'keep_both' }));
      const envelope = record(payload);
      if (envelope?.success === false) throw new Error('FILE_UPLOAD_FAILED');
      const uploaded = record(envelope?.file ?? record(envelope?.message)?.file ?? payload);
      const fileId = idOf(uploaded);
      if (!fileId) throw new Error('FILE_UPLOAD_FAILED');
      const verified = await metadata(fileId);
      if (verified.folderId !== folderId) throw new Error('FILE_LOCATION_INVALID');
      if (uploaded && idOf(uploaded) === fileId) return { ...verified, raw: uploaded };
      throw new Error('FILE_UPLOAD_FAILED');
    },
    metadata,
    open: async (fileId, intent) => {
      const tab = intent === 'view' ? window.open('', '_blank') : null;
      try {
        const file = await metadata(fileId);
        if (!file.downloadUrl) throw new Error('FILE_UNAVAILABLE');
        const url = new URL(file.downloadUrl);
        if (url.protocol !== 'https:') throw new Error('FILE_UNAVAILABLE');
        if (intent === 'view') {
          if (!tab) throw new Error('FILE_UNAVAILABLE');
          tab.location.href = url.href;
        } else {
          const anchor = document.createElement('a');
          anchor.href = url.href;
          anchor.download = file.name;
          anchor.rel = 'noopener noreferrer';
          anchor.click();
        }
      } catch (error) { tab?.close(); throw error; }
    },
    move: async (fileId, folderId, sourceItemId) => {
      if (!folderId.trim()) throw new Error('FILE_LOCATION_INVALID');
      const source = await metadata(fileId);
      const publicItemId = source.raw.itemId ?? source.raw.item_id;
      if (!sourceItemId || publicItemId !== sourceItemId) throw new Error('FILE_LOCATION_UNVERIFIED');
      if (!await isVerifiedPositionFolder(app, roomId, folderId)) throw new Error('FILE_LOCATION_INVALID');
      unwrapToolResult(await app.callServerTool({ name: 'mcpapp.files.update', arguments: { fileId, folderId } }));
      const moved = await metadata(fileId);
      if (moved.folderId !== folderId) throw new Error('FILE_LOCATION_INVALID');
    },
  };
}
