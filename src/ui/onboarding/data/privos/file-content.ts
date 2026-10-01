import { PrivosRestError } from '../../../privos-rest';
import type { FileContent, FileMetadata } from '../../ports/files';

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>> : null;
}

function validMime(value: unknown): value is string {
  return typeof value === 'string' && /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:;[\x20-\x7e]+)?$/.test(value);
}

function metadataMime(file: FileMetadata): string {
  const declared = file.mimeType?.trim().toLowerCase();
  if (validMime(declared)) return declared;
  const extension = declared || file.name.split('.').pop()?.toLowerCase() || '';
  const known: Readonly<Record<string, string>> = {
    md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
    json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  };
  return known[extension] ?? 'application/octet-stream';
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  const object = record(value);
  return object !== null && Object.getPrototypeOf(value) === Object.prototype && Object.values(object).every(isJson);
}

export async function decodeFileContent(response: unknown, file: FileMetadata): Promise<FileContent> {
  const envelope = record(response);
  const status = envelope?.statusCode;
  // Check authorization before accessing even the body property.
  if (status === 401 || status === 403) {
    throw new PrivosRestError('File access denied', status, 'error-not-allowed');
  }
  if (status !== undefined && (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status >= 300)) {
    throw new Error('FILE_UNAVAILABLE');
  }
  if (envelope && ('error' in envelope || envelope.success === false)) throw new Error('FILE_UNAVAILABLE');
  let parsedResult = Boolean(envelope && !('body' in envelope) && 'result' in envelope);
  let body: unknown = envelope && 'body' in envelope ? envelope.body
    : envelope && 'result' in envelope ? envelope.result : response;
  if (envelope && 'body' in envelope) {
    const bodyEnvelope = record(body);
    if (bodyEnvelope && ('error' in bodyEnvelope || bodyEnvelope.success === false)) throw new Error('FILE_UNAVAILABLE');
    if (bodyEnvelope && 'result' in bodyEnvelope) {
      parsedResult = true;
      body = bodyEnvelope.result;
    }
  }
  const object = record(body);
  let mimeType = metadataMime(file);
  let blob: Blob;
  // This endpoint supplies parsed JSON results, without a blob responseType.
  // JSON document keys must not be interpreted as binary transport metadata.
  if (parsedResult && mimeType.split(';')[0] === 'application/json' && isJson(body)) {
    blob = new Blob([JSON.stringify(body)], { type: mimeType });
  } else if (object && 'dataBase64' in object) {
    const { dataBase64, size } = object;
    if (typeof dataBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)
      || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) throw new Error('FILE_UNAVAILABLE');
    const decoded = atob(dataBase64);
    // Canonical roundtrip rejects nonzero padding bits as well as malformed base64.
    if (btoa(decoded) !== dataBase64 || decoded.length !== size) throw new Error('FILE_UNAVAILABLE');
    if (validMime(object.mimeType)) mimeType = object.mimeType.toLowerCase();
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    blob = new Blob([bytes.buffer], { type: mimeType });
  } else if (body instanceof Blob) {
    if (validMime(body.type)) mimeType = body.type;
    blob = body.type ? body : body.slice(0, body.size, mimeType);
  } else if (body instanceof ArrayBuffer) {
    blob = new Blob([body], { type: mimeType });
  } else if (ArrayBuffer.isView(body)) {
    const bytes = new Uint8Array(body.byteLength);
    bytes.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    blob = new Blob([bytes.buffer], { type: mimeType });
  } else if (!parsedResult && object && ('error' in object || object.success === false)) {
    throw new Error('FILE_UNAVAILABLE');
  } else if (typeof body === 'string' || typeof object?.content === 'string') {
    blob = new Blob([typeof body === 'string' ? body : String(object?.content)], { type: mimeType });
  } else if (mimeType.split(';')[0] === 'application/json' && isJson(body)) {
    blob = new Blob([JSON.stringify(body)], { type: mimeType });
  } else {
    throw new Error('FILE_UNAVAILABLE');
  }
  const text = mimeType.startsWith('text/') || mimeType.split(';')[0] === 'application/json' ? await blob.text() : null;
  return { fileId: file.id, name: file.name, mimeType, blob, text };
}
