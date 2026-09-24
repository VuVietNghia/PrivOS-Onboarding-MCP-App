import { describe, expect, it } from 'vitest';
import type { HubItem } from '../../src/ui/onboarding/domain/fields';
import { V2, V2_TEMPLATE_FIELDS, resolveSelectLabels, resolveV2FieldIds } from '../../src/ui/onboarding/domain/v2-fields';
import { decodeIsoDate, decodeScores, normalizeHubItem, parseHireItem, parsePositionItem, parseTemplateItems } from '../../src/ui/onboarding/domain/v2-schemas';

const defs = V2_TEMPLATE_FIELDS.map((field, index) => ({ _id: `f${index}`, name: field.name, type: field.type }));
const ids = Object.fromEntries(defs.map((field) => [field.name, field._id]));
const custom = (name: string, value: unknown) => ({ fieldId: ids[name], value });

describe('v2 field schema', () => {
  it('resolves field ids only when names and types match', () => {
    expect(resolveV2FieldIds(defs, V2_TEMPLATE_FIELDS)).toEqual(ids);
    expect(() => resolveV2FieldIds(defs.map((field) => field.name === V2.attachments ? { ...field, type: 'TEXT' } : field), V2_TEMPLATE_FIELDS)).toThrow('SCHEMA_DRIFT');
    expect(() => resolveV2FieldIds(defs.filter((field) => field.name !== V2.kind), V2_TEMPLATE_FIELDS)).toThrow('SCHEMA_MIGRATION_REQUIRED');
  });

  it('accepts a field definition carrying id instead of _id', () => {
    const alternateDefs = defs.map(({ _id, ...field }) => ({ ...field, id: _id }));
    expect(resolveV2FieldIds(alternateDefs, V2_TEMPLATE_FIELDS)).toEqual(ids);
  });
});

describe('parseTemplateItems', () => {
  it('normalizes alternate item ids, stage shapes and custom field shapes before decoding', () => {
    const raw = [
      { id: 'day-1', name: 'Ngày 1', stage_id: 'week-1', customFields: { [ids[V2.kind]]: 'Ngày', [ids[V2.order]]: 1, [ids[V2.content]]: 'Mục tiêu' } },
      { id: 'lesson-1', name: 'Bài 1', stage: { _id: 'week-1' }, parentId: 'day-1', customFields: [
        { fieldDefinitionId: ids[V2.kind], value: 'Bài học' }, { fieldDefinitionId: ids[V2.order], value: 0 },
        { fieldDefinitionId: ids[V2.content], value: 'Nội dung' }, { fieldDefinitionId: ids[V2.attachments], value: [{ id: 'file-1', name: 'guide.pdf', file_type: 'application/pdf' }] },
      ] },
    ];
    expect(parseTemplateItems(raw, ids)).toEqual([
      { id: 'day-1', name: 'Ngày 1', stageId: 'week-1', parentId: null, order: 1, kind: 'day', content: 'Mục tiêu' },
      { id: 'lesson-1', name: 'Bài 1', stageId: 'week-1', parentId: 'day-1', order: 0, kind: 'lesson', content: 'Nội dung', attachments: [{ id: 'file-1', name: 'guide.pdf', mimeType: 'application/pdf', raw: { id: 'file-1', name: 'guide.pdf', file_type: 'application/pdf' } }], videos: [], read: false },
    ]);
  });

  it('rejects missing identities and malformed custom fields instead of dropping item data', () => {
    expect(() => normalizeHubItem({ name: 'Ngày', stageId: 'week-1' })).toThrow('SCHEMA_DRIFT');
    expect(() => normalizeHubItem({ id: 'day-1', name: 'Ngày' })).toThrow('SCHEMA_DRIFT');
    expect(() => normalizeHubItem({ id: 'day-1', name: 'Ngày', stageId: 'week-1', customFields: 12 })).toThrow('SCHEMA_DRIFT');
    expect(() => normalizeHubItem({ id: 'day-1', name: 'Ngày', stageId: 'week-1', customFields: new Date('2026-01-01') })).toThrow('SCHEMA_DRIFT');
    expect(() => normalizeHubItem({ id: 'day-1', name: 'Ngày', stageId: 'week-1', customFields: [{ value: 'orphan' }] })).toThrow('SCHEMA_DRIFT');
  });

  it('decodes SELECT option ids through the readback field definition', () => {
    const optionDefs = defs.map((field) => field.name === V2.kind ? { ...field, options: [{ id: 'opt-day', value: 'Ngày' }, { _id: 'opt-lesson', value: 'Bài học' }, { _id: 'opt-question', value: 'Câu hỏi' }] } : field);
    const labels = resolveSelectLabels(optionDefs);
    const raw = [{ id: 'day-1', name: 'Ngày 1', stageId: 'week-1', customFields: { [ids[V2.kind]]: 'opt-day', [ids[V2.order]]: 1 } }];
    expect(parseTemplateItems(raw, ids, labels)[0]).toMatchObject({ id: 'day-1', kind: 'day' });
    expect(() => parseTemplateItems([{ ...raw[0], customFields: { ...raw[0].customFields, [ids[V2.kind]]: 'foreign-option' } }], ids, labels)).toThrow('SCHEMA_DRIFT');
  });

  it('decodes file references and multiple correct labels by field id', () => {
    const raw: HubItem[] = [
      { _id: 'd', name: 'Ngày 1', stageId: 'w', parentId: null, customFields: [custom(V2.kind, 'Ngày'), custom(V2.order, 1), custom(V2.content, 'Mục tiêu')] },
      { _id: 'l', name: 'Bài 1', stageId: 'w', parentId: 'd', customFields: [custom(V2.kind, 'Bài học'), custom(V2.order, 0), custom(V2.content, 'Markdown'), custom(V2.attachments, [{ _id: 'file-1', name: 'Guide.pdf', mimeType: 'application/pdf' }]), custom(V2.videos, 'https://example.com/video')] },
      { _id: 'q', name: 'Quiz', stageId: 'w', parentId: 'd', customFields: [custom(V2.kind, 'Câu hỏi'), custom(V2.order, 1), custom(V2.content, 'Chọn đáp án'), custom(V2.options, 'Một\nHai\nBa'), custom(V2.multiple, true), custom(V2.answers, 'a,c'), custom(V2.explanation, 'Giải thích')] },
    ];
    expect(parseTemplateItems(raw, ids)).toEqual([
      { id: 'd', name: 'Ngày 1', stageId: 'w', parentId: null, order: 1, kind: 'day', content: 'Mục tiêu' },
      { id: 'l', name: 'Bài 1', stageId: 'w', parentId: 'd', order: 0, kind: 'lesson', content: 'Markdown', attachments: [{ id: 'file-1', name: 'Guide.pdf', mimeType: 'application/pdf', raw: { _id: 'file-1', name: 'Guide.pdf', mimeType: 'application/pdf' } }], videos: ['https://example.com/video'], read: false },
      { id: 'q', name: 'Quiz', stageId: 'w', parentId: 'd', order: 1, kind: 'question', content: 'Chọn đáp án', options: ['Một', 'Hai', 'Ba'], correctLabels: ['a', 'c'], explanation: 'Giải thích', selectedLabels: [], correct: null },
    ]);
  });

  it('keeps the full FILE_MULTIPLE object for a later template copy', () => {
    const file = { _id: 'file-1', name: 'Guide.pdf', file_type: 'application/pdf', size: 2048,
      path: '/room/onboarding/Guide.pdf', storage: { bucket: 'files', key: 'opaque-1' } };
    const lesson: HubItem = { _id: 'l', name: 'Bài 1', stageId: 'w', parentId: 'd', customFields: [
      custom(V2.kind, 'Bài học'), custom(V2.order, 0), custom(V2.content, 'Markdown'), custom(V2.attachments, [file]),
    ] };
    const parsed = parseTemplateItems([lesson], ids);
    expect(parsed[0]).toMatchObject({ kind: 'lesson', attachments: [{ id: 'file-1', name: 'Guide.pdf', raw: file }] });
  });

  it('rejects malformed field values without dropping any item', () => {
    const bad: HubItem = { _id: 'q', name: 'Quiz', stageId: 'w', parentId: 'd', customFields: [custom(V2.kind, 'Câu hỏi'), custom(V2.order, 0), custom(V2.content, 'x'), custom(V2.options, 'A\nB'), custom(V2.answers, 'c')] };
    expect(() => parseTemplateItems([bad], ids)).toThrow('SCHEMA_DRIFT');
  });

  it('ignores unknown custom fields but rejects mismatched multiple-answer flag', () => {
    const question: HubItem = { _id: 'q', name: 'Quiz', stageId: 'w', parentId: 'd', customFields: [custom(V2.kind, 'Câu hỏi'), custom(V2.order, 0), custom(V2.content, 'x'), custom(V2.options, 'A\nB'), custom(V2.answers, 'a,b'), custom(V2.multiple, false), { fieldId: 'unknown', value: { preserved: true } }] };
    expect(() => parseTemplateItems([question], ids)).toThrow('SCHEMA_DRIFT');
    expect(parseTemplateItems([{ ...question, customFields: question.customFields?.map((field) => field.fieldId === ids[V2.multiple] ? { ...field, value: true } : field) }], ids)).toHaveLength(1);
  });

  it('keeps all 601 valid day items', () => {
    const raw: HubItem[] = Array.from({ length: 601 }, (_, index) => ({ _id: `d${index}`, name: `Ngày ${index + 1}`, stageId: 'w', parentId: null, customFields: [custom(V2.kind, 'Ngày'), custom(V2.order, index + 1), custom(V2.content, '')] }));
    expect(parseTemplateItems(raw, ids)).toHaveLength(601);
  });
});

describe('decodeScores', () => {
  it('roundtrips a lesson-only completion marker without quiz attempts', () => {
    const stored = JSON.stringify({ '2': { first: '—' } });
    expect(decodeScores(stored)).toEqual({ '2': { first: '—' } });
    expect(() => decodeScores('{"2":{"first":"—","attempts":[]}}')).toThrow('SCORES_INVALID');
  });

  it('rejects invalid day keys and impossible score fractions', () => {
    for (const stored of [
      '{"0":{"first":"1/2"}}', '{"01":{"first":"1/2"}}',
      '{"2":{"first":"3/2"}}', '{"2":{"first":"1/0"}}',
      '{"2":{"first":"1/2","attempts":["3/2"]}}',
    ]) expect(() => decodeScores(stored)).toThrow('SCORES_INVALID');
  });

  it('preserves first score and attempts', () => {
    expect(decodeScores('{"1":{"first":"4/5","attempts":["4/5","5/5"]}}')).toEqual({ '1': { first: '4/5', attempts: ['4/5', '5/5'] } });
    expect(decodeScores('')).toEqual({});
  });

  it('fails on invalid JSON or wrong shape instead of replacing scores', () => {
    expect(() => decodeScores('{')).toThrow('SCORES_INVALID');
    expect(() => decodeScores('{"1":{"first":4}}')).toThrow('SCORES_INVALID');
  });
});

describe('decodeIsoDate', () => {
  it('normalizes a timestamp and rejects invalid dates', () => {
    expect(decodeIsoDate('2026-09-25T00:00:00.000Z')).toBe('2026-09-25');
    expect(() => decodeIsoDate('2026-02-30')).toThrow('SCHEMA_DRIFT');
    expect(() => decodeIsoDate(new Date(Number.NaN))).toThrow('SCHEMA_DRIFT');
    expect(() => decodeIsoDate(Number.NaN)).toThrow('SCHEMA_DRIFT');
    expect(() => decodeIsoDate(Number.POSITIVE_INFINITY)).toThrow('SCHEMA_DRIFT');
  });
});

describe('v2 registry item parsers', () => {
  it('decodes a position without discarding its counters', () => {
    const positionIds = { [V2.template]: 'template', [V2.weeks]: 'weeks', [V2.days]: 'days', [V2.lessons]: 'lessons', [V2.questions]: 'questions', [V2.missingAnswers]: 'missing', [V2.inUse]: 'inUse' };
    const item = { _id: 'p1', name: 'Kỹ sư', stageId: 'ready', customFields: [
      { fieldId: 'template', value: 'list-1' }, { fieldId: 'weeks', value: 2 }, { fieldId: 'days', value: 10 },
      { fieldId: 'lessons', value: 20 }, { fieldId: 'questions', value: 5 }, { fieldId: 'missing', value: 1 }, { fieldId: 'inUse', value: 3 },
    ] };
    expect(parsePositionItem(item, positionIds, 'ready')).toEqual({ id: 'p1', name: 'Kỹ sư', templateListId: 'list-1', status: 'ready', weeks: 2, days: 10, lessons: 20, questions: 5, missingAnswers: 1, inUse: 3 });
    expect(() => parsePositionItem({ ...item, customFields: item.customFields.filter((field) => field.fieldId !== 'days') }, positionIds, 'ready')).toThrow('SCHEMA_DRIFT');
    expect(() => parsePositionItem({ ...item, customFields: item.customFields.map((field) => field.fieldId === 'template' ? { ...field, value: '' } : field) }, positionIds, 'ready')).toThrow('SCHEMA_DRIFT');
  });

  it('normalizes an ISO date and preserves score history on a hire', () => {
    const hireIds = { [V2.employee]: 'employee', [V2.position]: 'position', [V2.positionName]: 'positionName', [V2.startDate]: 'date', [V2.roadmap]: 'roadmap', [V2.doneDays]: 'done', [V2.totalDays]: 'total', [V2.scores]: 'scores', [V2.errorCode]: 'error', [V2.pendingAction]: 'action' };
    const item = { _id: 'h1', name: 'Minh', stageId: 'learning', customFields: [
      { fieldId: 'employee', value: ['u1'] }, { fieldId: 'position', value: 'p1' }, { fieldId: 'positionName', value: 'Kỹ sư' },
      { fieldId: 'date', value: '2026-09-25T00:00:00.000Z' }, { fieldId: 'roadmap', value: 'r1' },
      { fieldId: 'done', value: 1 }, { fieldId: 'total', value: 10 }, { fieldId: 'scores', value: '{"1":{"first":"4/5"}}' },
      { fieldId: 'error', value: '' }, { fieldId: 'action', value: '' },
    ] };
    expect(parseHireItem(item, hireIds, 'learning')).toEqual({ id: 'h1', employeeId: 'u1', name: 'Minh', positionId: 'p1', positionName: 'Kỹ sư', startDate: '2026-09-25', roadmapListId: 'r1', status: 'learning', doneDays: 1, totalDays: 10, scores: { '1': { first: '4/5' } }, errorCode: null, pendingAction: null });
    const unassigned = { ...item, customFields: [...item.customFields.filter((field) => field.fieldId !== 'employee'),
      { fieldId: 'checkpoint', value: JSON.stringify({ version: 1, employeeId: 'u1' }) }] };
    expect(parseHireItem(unassigned, { ...hireIds, [V2.provision]: 'checkpoint' }, 'provisioning').employeeId).toBe('u1');
    expect(() => parseHireItem(unassigned, hireIds, 'learning')).toThrow('SCHEMA_DRIFT');
    expect(() => parseHireItem({ ...item, customFields: item.customFields.map((field) => field.fieldId === 'scores' ? { ...field, value: '{' } : field) }, hireIds, 'learning')).toThrow('SCORES_INVALID');
  });
});
