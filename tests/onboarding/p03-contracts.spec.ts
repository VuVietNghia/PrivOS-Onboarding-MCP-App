import { describe, expect, it } from 'vitest';
import { approvedFileSize, buildScoreWrite, buildTextWrite, fileSizeVerified, pageAdvanceValid, pageQueryRequest, parsePage, parseSnapshot, searchRequest, snapshotQueryRequest, verifiedUploadFileId } from '../../src/ui/onboarding/dev/p03-contracts';

const page = { success: true, count: 1, nextCursor: null, items: [{ _id: 'hire-1', key: 'hire-test', customFields: [
  { fieldId: 'score', value: '{"existing":1}' }, { fieldId: 'other', value: 'keep' },
] }] };

describe('P0.3 bounded manual requests', () => {
  it('rejects a mismatched item or malformed readback', () => {
    expect(parseSnapshot(200, page, 'hire-1', 'hire-test')?.fields).toHaveLength(2);
    expect(parseSnapshot(200, page, 'other', 'hire-test')).toBeUndefined();
    expect(parseSnapshot(200, { ...page, success: false }, 'hire-1', 'hire-test')).toBeUndefined();
    expect(parseSnapshot(200, { ...page, items: [{ ...page.items[0], key: 'wrong' }] }, 'hire-1', 'hire-test')).toBeUndefined();
    expect(parseSnapshot(200, { ...page, nextCursor: 'more' }, 'hire-1', 'hire-test')).toBeUndefined();
  });

  it('preserves other fields and caps TEXTAREA writes at 8 KiB', () => {
    const snapshot = parseSnapshot(200, page, 'hire-1', 'hire-test');
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    const request = buildTextWrite(snapshot, 'score', 3072);
    expect(request?.customFields).toEqual([{ fieldId: 'other', value: 'keep' }, { fieldId: 'score', value: 'x'.repeat(3072) }]);
    expect(buildTextWrite(snapshot, 'score', 8193)).toBeUndefined();
    expect(buildTextWrite(snapshot, 'unknown', 3072)).toBeUndefined();
  });

  it('adds a distinct score marker to a captured snapshot and rejects oversized JSON', () => {
    const snapshot = parseSnapshot(200, page, 'hire-1', 'hire-test');
    expect(snapshot).toBeDefined();
    if (!snapshot) return;
    const request = buildScoreWrite(snapshot, 'score', 'tab-a', 1, 8192);
    expect(request?.customFields).toEqual([{ fieldId: 'other', value: 'keep' }, { fieldId: 'score', value: '{"existing":1,"p0ProbeScores":{"tab-a":1}}' }]);
    expect(buildScoreWrite(snapshot, 'score', 'tab-b', 2, 20)).toBeUndefined();
    expect(buildScoreWrite(snapshot, 'other', 'tab-b', 2, 8192)).toBeUndefined();
    expect(buildScoreWrite(snapshot, 'score', 'invalid space', 2, 8192)).toBeUndefined();
  });

  it('uses one bounded query for each accented search term', () => {
    expect(searchRequest('list-1', 'Chăm sóc').body).toEqual({ listId: 'list-1', filter: { text: 'Chăm sóc' }, count: 20, fields: ['name', 'key'] });
    expect(searchRequest('list-1', 'cham soc').body.filter.text).toBe('cham soc');
  });

  it('projects exact item and bounded page fields while preserving identity checks', () => {
    expect(snapshotQueryRequest('list-1', 'hire-test').body).toEqual({ listId: 'list-1',
      filter: { customFields: [{ fieldId: 'key', op: 'is', value: 'hire-test' }] }, count: 1,
      fields: ['name', 'key', 'customFields'],
    });
    expect(pageQueryRequest('list-1', 50).body).toEqual({ listId: 'list-1', count: 50, fields: ['name', 'key', 'parentId', 'stageId'] });
    expect(pageQueryRequest('list-1', 200, 'opaque').body.cursor).toBe('opaque');
    expect(() => pageQueryRequest('list-1', 201)).toThrow();
  });

  it('rejects pages that exceed requested count or contradict count', () => {
    const valid = { success: true, items: [{ _id: 'one' }, { _id: 'two' }], count: 2, nextCursor: null };
    expect(parsePage(200, valid, 2)?.ids).toEqual(['one', 'two']);
    expect(parsePage(200, valid, 1)).toBeUndefined();
    expect(parsePage(200, { ...valid, count: 1 }, 2)).toBeUndefined();
    expect(parsePage(200, { ...valid, items: [{ _id: 'one' }, { _id: 'one' }] }, 2)).toBeUndefined();
    expect(parsePage(200, { ...valid, success: false }, 2)).toBeUndefined();
    expect(pageAdvanceValid({ ids: ['two'], nextCursor: 'next' }, ['one'], ['cursor'], 'cursor')).toBe(true);
    expect(pageAdvanceValid({ ids: ['one'], nextCursor: 'next' }, ['one'], ['cursor'], 'cursor')).toBe(false);
    expect(pageAdvanceValid({ ids: ['two'], nextCursor: 'cursor' }, ['one'], ['cursor'], 'cursor')).toBe(false);
    expect(pageAdvanceValid({ ids: ['two'], nextCursor: 'older' }, ['one'], ['older', 'cursor'], 'cursor')).toBe(false);
    expect(pageAdvanceValid({ ids: [], nextCursor: 'next' }, ['one'], ['cursor'], 'cursor')).toBe(false);
  });

  it('only accepts explicitly capped representative image or PDF fixtures', () => {
    expect(approvedFileSize(1024 * 1024, 1024, 'application/pdf')).toBe(true);
    expect(approvedFileSize(1024 * 1024 + 1, 1024, 'application/pdf')).toBe(false);
    expect(approvedFileSize(8 * 1024 * 1024 + 1, 8192, 'image/png')).toBe(false);
    expect(approvedFileSize(4096, 1024, 'text/plain')).toBe(false);
    expect(approvedFileSize(0, 1024, 'image/jpeg')).toBe(false);
    expect(approvedFileSize(4096, 8193, 'image/png')).toBe(false);
    expect(fileSizeVerified(200, { success: true, file: { file_size: 4096 } }, 4096)).toBe(true);
    expect(fileSizeVerified(200, { success: true, file: { file_size: 4000 } }, 4096)).toBe(false);
    expect(fileSizeVerified(200, { success: true, file: {} }, 4096)).toBe(false);
  });

  it('reveals uploaded file ID only after exact metadata identity and room folder match', () => {
    const response = { success: true, file: { _id: 'file-1', channel_id: 'room-1', folder_id: 'folder-1', file_size: 4096 } };
    expect(verifiedUploadFileId('file-1', 200, response, 'room-1', 'folder-1')).toBe('file-1');
    expect(verifiedUploadFileId('file-1', 200, response, 'room-2', 'folder-1')).toBeUndefined();
    expect(verifiedUploadFileId('file-2', 200, response, 'room-1', 'folder-1')).toBeUndefined();
    expect(verifiedUploadFileId('file-1', 200, { ...response, success: false }, 'room-1', 'folder-1')).toBeUndefined();
  });
});
