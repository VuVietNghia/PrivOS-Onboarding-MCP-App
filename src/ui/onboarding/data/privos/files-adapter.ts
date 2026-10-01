import type { McpApp } from '@privos_ai/app-react';
import type { ExternalLinks, Lifetime, Scheduler } from '../../../../shared/ports/effects';
import { decodeFileContent } from './file-content';
import type { FileContent, FilesGateway } from '../../ports/files';
import { createFilesGateway } from '../files';

const CONTENT_TIMEOUT_MS = 20_000;

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
    return active(() => decodeFileContent(rawResponse, file));
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
