import type { UiError } from './ui-error';

const importCodes = {
  SOURCE_PATH_INVALID: 'IMPORT_PATH_INVALID',
  SOURCE_PATH_CONFLICT: 'IMPORT_CONFLICT',
  SOURCE_EMPTY: 'IMPORT_SOURCE_EMPTY',
  SOURCE_NO_POSITIONS: 'IMPORT_SOURCE_EMPTY',
  IMPORT_SOURCE_CHANGED: 'IMPORT_CHANGED',
  IMPORT_SOURCE_CONFLICT: 'IMPORT_CONFLICT',
  IMPORT_ORPHAN_CONFLICT: 'IMPORT_CONFLICT',
  ROOM_MISMATCH: 'IMPORT_ROOM_MISMATCH',
  NOT_ADMIN: 'NOT_ADMIN',
} as const satisfies Readonly<Record<string, UiError['code']>>;

function mappedCode(message: string): UiError['code'] | null {
  if (Object.prototype.hasOwnProperty.call(importCodes, message)) {
    return importCodes[message as keyof typeof importCodes];
  }
  if (/^[^\r\n<>]+\.md:\d+(?:\s|$)/u.test(message) || /duplicate Day_\d+/iu.test(message)) {
    return 'IMPORT_FORMAT_INVALID';
  }
  return null;
}

export function toImportUiError(error: unknown): UiError {
  if (!(error instanceof Error)) return { code: 'IMPORT_INVALID' };
  return { code: mappedCode(error.message) ?? 'IMPORT_INVALID' };
}
