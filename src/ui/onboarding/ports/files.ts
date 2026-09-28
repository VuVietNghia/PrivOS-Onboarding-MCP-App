import type { FileRef } from '../domain/models';

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
