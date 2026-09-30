import type { FileRef } from '../domain/models';

export interface FileMetadata extends FileRef {
  roomId: string;
  folderId: string;
  downloadUrl?: string;
  raw: Record<string, unknown>;
}

export interface FileContent {
  fileId: string;
  name: string;
  mimeType: string;
  blob: Blob;
  text: string | null;
}

export interface FilesGateway {
  folder(positionItemId: string): Promise<string>;
  upload(positionItemId: string, file: File): Promise<FileMetadata>;
  metadata(fileId: string): Promise<FileMetadata>;
  content(fileId: string): Promise<FileContent>;
  download(fileId: string): Promise<void>;
  open(fileId: string, intent: 'view' | 'download'): Promise<void>;
  move(fileId: string, folderId: string, sourceItemId?: string): Promise<void>;
}
