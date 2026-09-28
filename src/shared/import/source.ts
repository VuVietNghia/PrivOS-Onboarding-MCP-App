import type { ImportedPosition } from './models';

export interface SourceDocument { path: string; text: string }
export interface PositionSource { positions(): AsyncIterable<ImportedPosition> }
export interface SourceFileSystem {
  list(path: string): Promise<Array<{ name: string; kind: 'file' | 'directory' }>>;
  readText(path: string): Promise<string>;
  resolve(...parts: string[]): string;
  realPath?(path: string): Promise<string>;
}

export function validateSourcePath(path: string): string[] {
  if (!path || path.includes('\\') || path.startsWith('/') || path.endsWith('/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('SOURCE_PATH_INVALID');
  return path.split('/');
}
