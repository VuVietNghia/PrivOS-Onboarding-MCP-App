import { describe, expect, it } from 'vitest';
import { allPassed, sanitizeProbeData, validateProbeResponse, buildQueryRequest, nextPageCursor, invalidateProbeSession } from '../../src/ui/onboarding/dev/probe-results';

describe('allPassed', () => {
  it('does not accept a probe that has not run', () => {
    expect(allPassed([{ id: 'stage-create', state: 'not-run' }])).toBe(false);
  });

  it('does not accept an empty probe set', () => {
    expect(allPassed([])).toBe(false);
  });

  it('accepts only a nonempty set of passed probes', () => {
    expect(allPassed([{ id: 'query', state: 'pass', evidence: 'HTTP 200', checkedAt: '2026-09-23T00:00:00Z' }])).toBe(true);
    expect(allPassed([{ id: 'query', state: 'fail', evidence: 'HTTP 403', checkedAt: '2026-09-23T00:00:00Z' }])).toBe(false);
  });
});

describe('sanitizeProbeData', () => {
  it('retains response shape without user or field values', () => {
    expect(sanitizeProbeData({ items: [{ _id: 'item-secret', customFields: [{ fieldId: 'assignee', value: 'user-secret' }] }], count: 1, nextCursor: null })).toEqual({ items: [{ _id: '[string]', customFields: [{ fieldId: '[string]', value: '[string]' }] }], count: '[number]', nextCursor: null });
  });

  it('keeps known field type labels while redacting field values', () => {
    expect(sanitizeProbeData({ fieldDefinitions: [{ type: 'DATE', value: '2026-09-23' }, { type: 'ASSIGNEE', value: 'user-secret' }] })).toEqual({ fieldDefinitions: [{ type: 'DATE', value: '[string]' }, { type: 'ASSIGNEE', value: '[string]' }] });
  });

  it('keeps all five required field shapes in one schema sample', () => {
    expect(sanitizeProbeData(['DATE', 'CHECKBOX', 'SELECT', 'ASSIGNEE', 'FILE_MULTIPLE'].map((type) => ({ type, value: 'private' })))).toEqual(['DATE', 'CHECKBOX', 'SELECT', 'ASSIGNEE', 'FILE_MULTIPLE'].map((type) => ({ type, value: '[string]' })));
  });

  it('hides arbitrary object keys as well as values', () => {
    expect(sanitizeProbeData({ 'private-user@example.com': 'secret', items: [] })).toEqual({ '[field-1]': '[string]', items: [] });
  });
});

const schema = { success: true, list: { _id: 'L1', key: 'probe-one', isolatedList: true, fieldDefinitions: ['DATE', 'CHECKBOX', 'SELECT', 'ASSIGNEE', 'FILE_MULTIPLE'].map((type) => ({ type })) }, stages: [{ _id: 'S1' }] };

describe('validateProbeResponse', () => {
  it('rejects a successful HTTP body without the requested contract', () => {
    const context = { listId: 'L1', listKey: 'probe-one', itemKey: 'item-one', stageId: 'S1', parentId: null, fieldId: 'assignee', assigneeId: 'U1', fileId: 'F1' };
    for (const id of ['list-create', 'list-info', 'item-create', 'items-query', 'item-lookup', 'field-update', 'file-info', 'file-upload'] as const) {
      expect(validateProbeResponse(id, {}, context), id).toBe(false);
    }
  });

  it('checks list creation and info against isolated schema and stages', () => {
    const context = { listId: 'L1', listKey: 'probe-one' };
    expect(validateProbeResponse('list-info', schema, context)).toBe(true);
    expect(validateProbeResponse('list-create', { success: true, list: { _id: 'L1' }, readback: schema }, context)).toBe(true);
    expect(validateProbeResponse('list-create', { success: true, list: { _id: 'L1' }, readback: { ...schema, stages: [] } }, context)).toBe(false);
    expect(validateProbeResponse('list-create', { success: true, list: { _id: 'L1' }, readback: { ...schema, success: false } }, context)).toBe(false);
    expect(validateProbeResponse('list-info', { ...schema, list: { ...schema.list, isolatedList: false } }, context)).toBe(false);
  });

  it('checks item creation and lookup by ID, key, parent and assignee', () => {
    const item = { _id: 'I1', key: 'item-one', stageId: 'S1', parentId: 'P1', customFields: [{ fieldId: 'A1', value: 'U1' }] };
    const context = { itemKey: 'item-one', stageId: 'S1', parentId: 'P1', fieldId: 'A1', assigneeId: 'U1' };
    expect(validateProbeResponse('item-create', { success: true, item: { _id: 'I1' }, readback: { success: true, items: [item], count: 1, nextCursor: null } }, context)).toBe(true);
    expect(validateProbeResponse('item-lookup', { success: true, items: [item], count: 1, nextCursor: null }, context)).toBe(true);
    expect(validateProbeResponse('item-create', { success: true, item: { _id: 'I1' }, readback: { success: true, items: [{ ...item, parentId: null }], count: 1, nextCursor: null } }, context)).toBe(false);
    expect(validateProbeResponse('item-create', { success: true, item: { _id: 'I1' }, readback: { success: true, items: [{ ...item, customFields: [] }], count: 1, nextCursor: null } }, context)).toBe(false);
    expect(validateProbeResponse('item-lookup', { items: [{ ...item, key: 'wrong' }], count: 1, nextCursor: null }, context)).toBe(false);
  });

  it('checks query shape, filters, projection and cursor', () => {
    const context = { stageId: 'S1', parentId: null, fields: ['name', 'key', 'stageId', 'parentId', 'customFields'] };
    const valid = { success: true, items: [{ _id: 'I1', name: 'day', key: 'day', stageId: 'S1', parentId: null, customFields: [] }], count: 1, nextCursor: 'opaque-token' };
    expect(validateProbeResponse('items-query', valid, context)).toBe(true);
    expect(validateProbeResponse('items-query', { ...valid, items: [{ ...valid.items[0], stageId: 'S2' }] }, context)).toBe(false);
    expect(validateProbeResponse('items-query', { ...valid, nextCursor: 123 }, context)).toBe(false);
    expect(validateProbeResponse('items-query', { ...valid, items: [{ ...valid.items[0], leaked: 'value' }] }, context)).toBe(false);
    expect(validateProbeResponse('items-query', { ...valid, items: [{ _id: 'I1', stageId: 'S1', parentId: null }] }, context)).toBe(false);
    expect(validateProbeResponse('items-query', { items: [], count: 0, nextCursor: null }, context)).toBe(false);
  });

  it('requires matching file identity and valid update readback', () => {
    expect(validateProbeResponse('file-info', { success: true, file: { _id: 'F1' } }, { fileId: 'F1' })).toBe(true);
    expect(validateProbeResponse('file-upload', { success: true, file: { _id: 'F1' } }, {})).toBe(true);
    expect(validateProbeResponse('file-info', { file: { _id: 'other' } }, { fileId: 'F1' })).toBe(false);
    expect(validateProbeResponse('field-update', { success: true, items: [{ _id: 'I1', key: 'item-one', customFields: [{ fieldId: 'A1', value: 'U1' }] }], count: 1, nextCursor: null }, { itemKey: 'item-one', fieldId: 'A1', assigneeId: 'U1' })).toBe(true);
  });

  it('rejects missing success envelopes and mismatched page counts', () => {
    const item = { _id: 'I1', key: 'item-one', name: 'Day', stageId: 'S1', parentId: null, customFields: [] };
    expect(validateProbeResponse('list-info', { ...schema, success: undefined }, { listId: 'L1', listKey: 'probe-one' })).toBe(false);
    expect(validateProbeResponse('list-create', { list: { _id: 'L1' }, readback: schema }, { listKey: 'probe-one' })).toBe(false);
    expect(validateProbeResponse('item-create', { item: { _id: 'I1' }, readback: { success: true, items: [item], count: 1, nextCursor: null } }, { itemKey: 'item-one' })).toBe(false);
    expect(validateProbeResponse('file-info', { file: { _id: 'F1' } }, { fileId: 'F1' })).toBe(false);
    expect(validateProbeResponse('file-upload', { file: { _id: 'F1' } }, {})).toBe(false);
    expect(validateProbeResponse('items-query', { success: true, items: [item], count: 2, nextCursor: null }, { fields: ['name', 'key', 'stageId', 'parentId', 'customFields'] })).toBe(false);
    expect(validateProbeResponse('item-lookup', { success: true, items: [item], count: 0, nextCursor: null }, { itemKey: 'item-one' })).toBe(false);
  });
});

describe('query pagination', () => {
  it('passes the exact opaque cursor to the next page without exposing it as a field', () => {
    const first = buildQueryRequest('L1', 'S1', { mode: 'root' });
    expect(first.body).toEqual({ listId: 'L1', filter: { stageId: 'S1', parentId: null }, count: 20, fields: ['name', 'key', 'stageId', 'parentId', 'customFields'] });
    expect(nextPageCursor({ success: true, items: [], count: 0, nextCursor: 'opaque-token' })).toBe('opaque-token');
    expect(buildQueryRequest('L1', 'S1', { mode: 'root' }, 'opaque-token').body).toEqual({ ...first.body, cursor: 'opaque-token' });
    expect(buildQueryRequest('L1', '', { mode: 'any' }).body).toEqual({ listId: 'L1', filter: {}, count: 20, fields: ['name', 'key', 'stageId', 'parentId', 'customFields'] });
    expect(buildQueryRequest('L1', '', { mode: 'children', parentId: 'P1' }).body).toEqual({ listId: 'L1', filter: { parentId: 'P1' }, count: 20, fields: ['name', 'key', 'stageId', 'parentId', 'customFields'] });
  });
});

describe('probe target changes', () => {
  it('revokes consent, cursor and old evidence when the target changes', () => {
    expect(invalidateProbeSession({
      generation: 2, consent: true, nextCursor: 'opaque-token', preview: 'old request', capture: 'old response',
      results: [{ id: 'list-info', state: 'pass', evidence: 'old room', checkedAt: '2026-09-23T00:00:00Z' }],
    })).toEqual({ generation: 3, consent: false, nextCursor: undefined, preview: '', capture: '', results: [{ id: 'list-info', state: 'not-run' }] });
  });
});
