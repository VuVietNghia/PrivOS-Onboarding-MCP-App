import type { FileRef } from '../domain/models';
import type { FileMetadata } from './files';
import { idOf } from './tool-result';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function parseFileRefs(value: unknown): FileRef[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('FILE_REF_INVALID');
  return value.map((entry) => {
    const raw = record(entry);
    const id = idOf(raw);
    if (!raw || !id) throw new Error('FILE_REF_INVALID');
    const name = typeof raw.name === 'string' && raw.name ? raw.name : id;
    const mimeType = raw.file_type ?? raw.fileType ?? raw.mimeType;
    return { id, name, ...(typeof mimeType === 'string' ? { mimeType } : {}), raw };
  });
}

export function appendFileRef(current: unknown, file: FileMetadata): Record<string, unknown>[] {
  const refs = parseFileRefs(current);
  if (refs.some((ref) => ref.id === file.id)) return refs.map((ref) => ref.raw as Record<string, unknown>);
  if (!file.raw || idOf(file.raw) !== file.id) throw new Error('FILE_REF_INVALID');
  return [...refs.map((ref) => ref.raw as Record<string, unknown>), file.raw];
}

export function appendFileMarker(description: string | undefined, fileId: string): string {
  if (!fileId || /[\]\s]/.test(fileId)) throw new Error('FILE_REF_INVALID');
  const original = description ?? '';
  const markers = [...original.matchAll(/\[fileId:([^\]\s]+)\]/g)].map((match) => match[1]);
  if (markers.includes(fileId)) return original;
  return `${original}${original ? '\n' : ''}[fileId:${fileId}]`;
}
