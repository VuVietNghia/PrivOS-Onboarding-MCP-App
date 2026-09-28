import type { McpApp } from '@privos_ai/app-react';
import type { ExternalLinks, Lifetime, Scheduler } from '../../../../shared/ports/effects';
import type { FilesGateway } from '../../ports/files';
import { createFilesGateway } from '../files';

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
  return {
    // files:read covers metadata/open; files:write covers folder, upload and move.
    folder: (positionId) => active(() => gateway.folder(positionId)),
    upload: (positionId, file) => active(() => gateway.upload(positionId, file)),
    metadata: (fileId) => active(() => gateway.metadata(fileId)),
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
