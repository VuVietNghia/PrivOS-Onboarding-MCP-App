import { describe, expect, it } from 'vitest';
import { decodeTemplateTree, encodeTemplateFields } from '../../src/ui/onboarding/domain/template-item-model';
import { V2, V2_TEMPLATE_FIELDS } from '../../src/ui/onboarding/domain/v2-fields';

const defs = V2_TEMPLATE_FIELDS.map((field, index) => ({
  _id: `f${index}`, name: field.name, type: field.type,
  ...(field.options ? { options: field.options.map((value, optionIndex) => ({ _id: `o${index}-${optionIndex}`, value })) } : {}),
}));
const id = (name: string) => defs.find((field) => field.name === name)!._id;
const value = (name: string, v: unknown) => ({ fieldId: id(name), value: v });
const kind = (label: string) => defs[0].options!.find((option) => option.value === label)!._id;

describe('template item model', () => {
  it('reconstructs virtual week IDs from the Cha field even when Hub omits parentId', () => {
    const rows = [
      { _id: 'week-1', name: 'Tuần 1', stageId: 'content-stage', customFields: [value(V2.kind, kind('Tuần')), value(V2.order, 0), value(V2.parent, '')] },
      { _id: 'day-1', name: 'Ngày 1', stageId: 'content-stage', customFields: [value(V2.kind, kind('Ngày')), value(V2.order, 1), value(V2.parent, 'week-1'), value(V2.content, 'Mục tiêu')] },
      { _id: 'lesson-1', name: 'Bài học', stageId: 'content-stage', customFields: [value(V2.kind, kind('Bài học')), value(V2.order, 0), value(V2.parent, 'day-1'), value(V2.content, 'Nội dung')] },
    ];
    const tree = decodeTemplateTree(rows, defs, 'content-stage');
    expect(tree.weeks).toEqual([{ id: 'week-1', name: 'Tuần 1', order: 0 }]);
    expect(tree.items).toMatchObject([
      { id: 'day-1', kind: 'day', stageId: 'week-1', parentId: null },
      { id: 'lesson-1', kind: 'lesson', stageId: 'week-1', parentId: 'day-1' },
    ]);
  });

  it('encodes select option IDs and preserves complete file objects', () => {
    const file = { _id: 'f1', name: 'guide.pdf', mimeType: 'application/pdf', size: 123 };
    const encoded = encodeTemplateFields({ id: 'l', kind: 'lesson', name: 'Bài', stageId: 'w', parentId: 'd', order: 0,
      content: 'Markdown', attachments: [{ id: 'f1', name: 'guide.pdf', raw: file }], videos: [], read: false }, defs, 'd');
    expect(encoded).toContainEqual(value(V2.kind, kind('Bài học')));
    expect(encoded).toContainEqual(value(V2.parent, 'd'));
    expect(encoded).toContainEqual(value(V2.attachments, [file]));
  });

  it('requires Cha schema before decoding an older List', () => {
    expect(() => decodeTemplateTree([], defs.filter((field) => field.name !== V2.parent), 'content-stage'))
      .toThrow('SCHEMA_MIGRATION_REQUIRED');
  });
});
