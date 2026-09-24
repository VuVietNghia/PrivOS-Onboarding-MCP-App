import { describe, expect, it } from 'vitest';
import type { ContentItem, TemplateTree } from '../../src/ui/onboarding/domain/models';
import { validateTree } from '../../src/ui/onboarding/domain/tree';

const week = { id: 'w', name: 'Tuần bất kỳ', order: 0 };
const day: ContentItem = { id: 'd', kind: 'day', name: 'Ngày 1', stageId: 'w', order: 1, parentId: null, content: 'Mục tiêu' };
const lesson: ContentItem = { id: 'l', kind: 'lesson', name: 'Bài 1', stageId: 'w', order: 0, parentId: 'd', content: 'Nội dung', attachments: [], videos: [], read: false };
const tree = (items: ContentItem[]): TemplateTree => ({ weeks: [week], items });

describe('validateTree', () => {
  it('requires at least one day in each week', () => {
    expect(validateTree(tree([]), 'template')).toContain('EMPTY_WEEK');
  });

  it('accepts a day with one child', () => {
    expect(validateTree(tree([day, lesson]), 'template')).toEqual([]);
  });

  it('rejects a day under another item and a lesson without a day parent', () => {
    expect(validateTree(tree([{ ...day, parentId: 'l' }, lesson]), 'template')).toContain('DAY_PARENT_INVALID');
    expect(validateTree(tree([day, { ...lesson, parentId: 'missing' }]), 'template')).toContain('CHILD_PARENT_INVALID');
  });

  it('rejects stage mismatch, missing stage, and duplicate absolute day order', () => {
    expect(validateTree(tree([day, { ...lesson, stageId: 'other' }]), 'template')).toContain('CHILD_STAGE_MISMATCH');
    expect(validateTree(tree([day, { ...lesson, stageId: 'other' }]), 'template')).toContain('STAGE_MISSING');
    expect(validateTree(tree([day, { ...day, id: 'd2' }]), 'template')).toContain('DUPLICATE_DAY_ORDER');
  });

  it('requires positive integer day order and nonnegative child order', () => {
    expect(validateTree(tree([{ ...day, order: 0 }, { ...lesson, order: -1 }]), 'template')).toEqual(expect.arrayContaining(['DAY_ORDER_INVALID', 'CHILD_ORDER_INVALID']));
  });

  it('accepts 601 items without truncation', () => {
    const many = Array.from({ length: 600 }, (_, index): ContentItem => ({ ...lesson, id: `l${index}`, order: index }));
    expect(validateTree(tree([day, ...many]), 'template')).toEqual([]);
  });
});
