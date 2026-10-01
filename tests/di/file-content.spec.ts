import { expect, it } from 'vitest';
import { decodeFileContent } from '../../src/ui/onboarding/data/privos/file-content';
import type { FileMetadata } from '../../src/ui/onboarding/ports/files';

const file: FileMetadata = { id: 'f1', name: 'file.png', roomId: 'r1', folderId: 'd1', raw: {} };
const binary = { dataBase64: 'AP+JUA==', size: 4, mimeType: 'image/png' };

it('decodes_nested_binary_envelope', async () => {
  for (const response of [{ body: { result: binary } }, { body: binary }, { result: binary }, binary]) {
    const result = await decodeFileContent(response, file);
    expect([...new Uint8Array(await result.blob.arrayBuffer())]).toEqual([0, 255, 137, 80]);
    expect(result.mimeType).toBe('image/png');
    expect(result.text).toBeNull();
  }
});

it('preserves_typed_array_offset', async () => {
  const buffer = new Uint8Array([42, 0, 255, 137, 80, 42]);
  for (const view of [buffer.subarray(1, 5), new DataView(buffer.buffer, 1, 4)]) {
    const result = await decodeFileContent(view, file);
    expect([...new Uint8Array(await result.blob.arrayBuffer())]).toEqual([0, 255, 137, 80]);
  }
});

it('rejects_invalid_base64_or_size', async () => {
  for (const invalid of [
    { ...binary, size: 5 }, { ...binary, size: -1 }, { ...binary, size: 4.5 },
    { ...binary, dataBase64: 'AP+JUA=!' }, { ...binary, dataBase64: 'AP+JUB==' },
    { ...binary, dataBase64: 'AP+JUA' }, { dataBase64: 'AP+JUA==' },
  ]) await expect(decodeFileContent(invalid, file)).rejects.toThrow('FILE_UNAVAILABLE');
});

it('denies_403_before_body_decode', async () => {
  for (const statusCode of [401, 403]) {
    const response = { statusCode, get body(): never { throw new Error('body accessed'); } };
    await expect(decodeFileContent(response, file)).rejects.toMatchObject({ statusCode, code: 'error-not-allowed' });
  }
});

it('preserves_arraybuffer_blob_and_base64_utf8_text', async () => {
  const bytes = new Uint8Array([0, 255, 137, 80]);
  for (const body of [bytes.buffer, new Blob([bytes], { type: 'image/png' })]) {
    const result = await decodeFileContent(body, file);
    expect([...new Uint8Array(await result.blob.arrayBuffer())]).toEqual([...bytes]);
  }
  const utf8 = new TextEncoder().encode('Xin chào');
  const result = await decodeFileContent({ dataBase64: btoa(String.fromCharCode(...utf8)), size: utf8.length, mimeType: 'text/plain' }, file);
  expect(result.text).toBe('Xin chào');
});

it('preserves_text_and_json', async () => {
  const textFile = { ...file, name: 'guide.txt' };
  for (const body of ['Xin chào Việt Nam', { content: 'Xin chào Việt Nam' }, new Blob(['Xin chào Việt Nam'])]) {
    expect((await decodeFileContent({ body }, textFile)).text).toBe('Xin chào Việt Nam');
  }
  const jsonFile = { ...file, mimeType: 'application/json' };
  for (const body of [{ title: 'Hướng dẫn' }, { message: 'Welcome', code: 123, success: true }, { success: false, error: 'business field' }, { content: 'business content' }, 'parsed JSON string', [1, null, 'xin chào'], null]) {
    const result = await decodeFileContent({ statusCode: 200, body: { result: body } }, jsonFile);
    expect(result.text).toBe(JSON.stringify(body));
    expect(await result.blob.text()).toBe(JSON.stringify(body));
  }
  expect((await decodeFileContent('"raw JSON text"', jsonFile)).text).toBe('"raw JSON text"');
});

it('rejects_error_metadata_and_invalid_status', async () => {
  for (const response of [{ error: 'secret' }, { success: false }, { statusCode: 500, body: 'secret' }]) {
    await expect(decodeFileContent(response, { ...file, mimeType: 'application/json' })).rejects.toThrow();
  }
});

it('uses_valid_envelope_mime_or_metadata_fallback', async () => {
  expect((await decodeFileContent({ ...binary, mimeType: 'text/plain' }, file)).mimeType).toBe('text/plain');
  expect((await decodeFileContent({ ...binary, mimeType: 'invalid\r\nvalue' }, file)).mimeType).toBe('image/png');
});

it('preserves_binary_named_business_fields_in_parsed_json', async () => {
  const jsonFile = { ...file, mimeType: 'application/json' };
  for (const document of [
    { dataBase64: 'business field' },
    { dataBase64: 'e30=', size: 2, mimeType: 'application/json' },
  ]) {
    const result = await decodeFileContent({ statusCode: 200, body: { result: document } }, jsonFile);
    expect(JSON.parse(result.text ?? '')).toEqual(document);
    expect(JSON.parse(await result.blob.text())).toEqual(document);
  }
});
