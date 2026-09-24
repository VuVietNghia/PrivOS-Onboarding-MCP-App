import { PrivosRestError } from '../../privos-rest';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

export function idOf(value: unknown): string | undefined {
  const object = record(value);
  const id = object?._id ?? object?.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

export function unwrapToolResult(response: unknown): unknown {
  const outer = record(response);
  const envelope = record(outer?.result) ?? outer;
  const content = envelope?.content ?? outer?.content;
  const first = Array.isArray(content) ? record(content[0]) : undefined;
  const text = first?.text;
  let payload: unknown = envelope?.structuredContent ?? outer?.structuredContent ?? envelope ?? response;
  if (typeof text === 'string') {
    try { payload = JSON.parse(text) as unknown; }
    catch { payload = text; }
  }
  const object = record(payload);
  const detail = record(object?.data) ?? object;
  if (outer?.isError === true || envelope?.isError === true || object?.success === false || detail?.success === false) {
    const status = typeof detail?.statusCode === 'number' ? detail.statusCode :
      typeof object?.statusCode === 'number' ? object.statusCode : undefined;
    const code = typeof detail?.errorType === 'string' ? detail.errorType :
      typeof detail?.code === 'string' ? detail.code : undefined;
    throw new PrivosRestError('Hub tool failed', status, code);
  }
  return object?.data ?? payload;
}
