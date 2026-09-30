import type { McpApp } from '@privos_ai/app-react';
import type { ExternalLinks, Lifetime, Scheduler } from '../../../../shared/ports/effects';
import { PrivosRestError } from '../../../privos-rest';
import type { FileContent, FileMetadata, FilesGateway } from '../../ports/files';
import { createFilesGateway } from '../files';

const CONTENT_TIMEOUT_MS = 20_000;

function fileMimeType(file: FileMetadata): string {
  const declared = file.mimeType?.trim().toLowerCase();
  if (declared?.includes('/')) return declared;
  const nameParts = file.name.split('.');
  const extension = (declared || nameParts[nameParts.length - 1] || '').toLowerCase();
  const known: Readonly<Record<string, string>> = {
    md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
    json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  };
  return known[extension] ?? 'application/octet-stream';
}

function contentBlob(body: unknown, mimeType: string): Blob {
  if (body instanceof Blob) return body.type ? body : body.slice(0, body.size, mimeType);
  if (typeof body === 'string' || body instanceof ArrayBuffer) {
    return new Blob([body], { type: mimeType });
  }
  if (ArrayBuffer.isView(body)) {
    const bytes = new Uint8Array(body.byteLength);
    bytes.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    return new Blob([bytes.buffer], { type: mimeType });
  }
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const content = (body as Readonly<Record<string, unknown>>).content;
    if (typeof content === 'string') return new Blob([content], { type: mimeType });
  }
  throw new Error('FILE_UNAVAILABLE');
}

function inlineText(body: unknown): string | null {
  if (typeof body === 'string') return body;
  const value = record(body)?.content;
  return typeof value === 'string' ? value : null;
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json';
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function unwrapRestContent(value: unknown): { statusCode: number; body: unknown } {
  const envelope = record(value);
  const rawStatusCode = envelope?.statusCode;
  const statusCode = typeof rawStatusCode === 'number' ? rawStatusCode : 200;
  const body = envelope && 'body' in envelope
    ? envelope.body
    : envelope && 'result' in envelope
      ? envelope.result
      : value;
  return { statusCode, body };
}

export function createPrivosFiles(
  app: McpApp,
  roomId: string,
  effects: { links: ExternalLinks; scheduler: Scheduler; lifetime: Lifetime },
): FilesGateway {
  const gateway = createFilesGateway(app, roomId, effects.scheduler);
  const active = async <T>(operation: () => Promise<T>): Promise<T> => {
    effects.lifetime.assertActive();
    const value = await operation();
    effects.lifetime.assertActive();
    return value;
  };
  const content = async (fileId: string): Promise<FileContent> => {
    const file = await active(() => gateway.metadata(fileId));
    const rawResponse: unknown = await active(() => app.rest({
      method: 'GET', path: `file-management.files/${encodeURIComponent(file.id)}/content`,
      timeoutMs: CONTENT_TIMEOUT_MS,
    }));
    const response = unwrapRestContent(rawResponse);
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new PrivosRestError('File access denied', response.statusCode, 'error-not-allowed');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new PrivosRestError('File content unavailable', response.statusCode);
    }
    const mimeType = fileMimeType(file);
    const blob = contentBlob(response.body, mimeType);
    const text = isTextMimeType(mimeType) ? inlineText(response.body) ?? await blob.text() : null;
    return { fileId: file.id, name: file.name, mimeType, blob, text };
  };
  return {
    // files:read covers metadata/open; files:write covers folder, upload and move.
    folder: (positionId) => active(() => gateway.folder(positionId)),
    upload: (positionId, file) => active(() => gateway.upload(positionId, file)),
    metadata: (fileId) => active(() => gateway.metadata(fileId)),
    content,
    download: async (fileId) => {
      const file = await content(fileId);
      effects.links.save(file.blob, file.name);
    },
    move: (fileId, folderId, sourceItemId) => active(() => gateway.move(fileId, folderId, sourceItemId)),
    open: (fileId, intent) => effects.links.open(async () => {
      const file = await active(() => gateway.metadata(fileId));
      if (!file.downloadUrl) throw new Error('FILE_UNAVAILABLE');
      const url = new URL(file.downloadUrl);
      if (url.protocol !== 'https:') throw new Error('FILE_UNAVAILABLE');
      return { url: url.href, name: file.name };
    }, intent),
  };
}
