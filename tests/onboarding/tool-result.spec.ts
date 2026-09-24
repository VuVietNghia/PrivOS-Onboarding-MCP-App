import { describe, expect, it } from 'vitest';
import { PrivosRestError } from '../../src/ui/privos-rest';
import { idOf, unwrapToolResult } from '../../src/ui/onboarding/data/tool-result';

describe('MCP tool result boundary', () => {
  it('rejects a resolved isError response and retains the Hub status and code', () => {
    expect(() => unwrapToolResult({ isError: true, content: [{ type: 'text', text: JSON.stringify({ statusCode: 403, errorType: 'error-forbidden' }) }] }))
      .toThrow(PrivosRestError);
    try {
      unwrapToolResult({ isError: true, content: [{ type: 'text', text: JSON.stringify({ statusCode: 403, errorType: 'error-forbidden' }) }] });
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 403, code: 'error-forbidden' });
    }
  });

  it('reads structured content, text JSON and nested data without losing the payload', () => {
    expect(unwrapToolResult({ structuredContent: { list: { id: 'list-1' } } })).toEqual({ list: { id: 'list-1' } });
    expect(unwrapToolResult({ result: { content: [{ type: 'text', text: '{"data":{"items":[{"id":"item-1"}]}}' }] } }))
      .toEqual({ items: [{ id: 'item-1' }] });
  });

  it('accepts both public ID spellings and rejects malformed IDs', () => {
    expect(idOf({ _id: 'a', id: 'b' })).toBe('a');
    expect(idOf({ id: 'b' })).toBe('b');
    expect(idOf({ id: 7 })).toBeUndefined();
  });
});
