import { describe, expect, it } from 'vitest';
import { appendFileRef, appendFileMarker, parseFileRefs } from '../../src/ui/onboarding/data/file-refs';

describe('FILE_MULTIPLE references', () => {
  const upload = { _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'folder-1', file_size: 42, file_type: 'application/pdf' };

  it('keeps the entire upload object and deduplicates by id', () => {
    const first = appendFileRef([], { id: 'file-1', name: 'guide.pdf', roomId: 'room-1', folderId: 'folder-1', raw: upload });
    expect(first).toEqual([upload]);
    expect(appendFileRef(first, { id: 'file-1', name: 'guide.pdf', roomId: 'room-1', folderId: 'folder-1', raw: upload })).toEqual([upload]);
    expect(parseFileRefs(first)).toMatchObject([{ id: 'file-1', name: 'guide.pdf', mimeType: 'application/pdf' }]);
  });

  it('rejects bare ids because Hub requires file objects', () => {
    expect(() => parseFileRefs(['file-1'])).toThrow('FILE_REF_INVALID');
  });

  it('preserves existing description and markers without repeating a file id', () => {
    expect(appendFileMarker('Read this [fileId:file-0]', 'file-1')).toBe('Read this [fileId:file-0]\n[fileId:file-1]');
    expect(appendFileMarker('Read this [fileId:file-1]', 'file-1')).toBe('Read this [fileId:file-1]');
  });
});
