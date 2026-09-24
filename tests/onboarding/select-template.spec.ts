import { describe, expect, it } from 'vitest';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { selectTemplate } from '../../src/ui/onboarding/domain/select-template';

const raw = { _id: 'file-1', name: 'guide.pdf', channel_id: 'room-1', folder_id: 'folder-1' };
const source: TemplateTree = { weeks: [
  { id: 'week-1', name: 'Tuần 1', order: 0 }, { id: 'week-2', name: 'Tuần 2', order: 1 },
], items: [
  { id: 'day-1', kind: 'day', name: 'Ngày 1', stageId: 'week-1', parentId: null, order: 1, content: '' },
  { id: 'lesson-1', kind: 'lesson', name: 'Bài', stageId: 'week-1', parentId: 'day-1', order: 0, content: 'Đọc',
    attachments: [{ id: 'file-1', name: 'guide.pdf', raw }], videos: [], read: true },
  { id: 'q-1', kind: 'question', name: 'Câu', stageId: 'week-1', parentId: 'day-1', order: 0, content: 'Hỏi',
    options: ['A', 'B'], correctLabels: ['b'], explanation: 'B đúng', selectedLabels: ['a'], correct: false },
  { id: 'day-2', kind: 'day', name: 'Ngày 2', stageId: 'week-2', parentId: null, order: 2, content: '' },
] };

describe('selectTemplate', () => {
  it('copies a day with its week and direct children, keeping full file objects', () => {
    const copied = selectTemplate(source, { kind: 'days', dayIds: ['day-1'] });
    expect(copied.weeks.map((week) => week.name)).toEqual(['Tuần 1']);
    expect(copied.items.map((item) => item.name)).toEqual(['Ngày 1', 'Bài', 'Câu']);
    expect(copied.weeks[0].id).toMatch(/^draft:/);
    const day = copied.items.find((item) => item.kind === 'day');
    const lesson = copied.items.find((item) => item.kind === 'lesson');
    const question = copied.items.find((item) => item.kind === 'question');
    expect(day?.stageId).toBe(copied.weeks[0].id);
    expect(lesson?.parentId).toBe(day?.id);
    expect(lesson?.kind === 'lesson' && lesson.attachments[0].raw).toEqual(raw);
    expect(lesson?.kind === 'lesson' && lesson.read).toBe(false);
    expect(question?.kind === 'question' && question.correctLabels).toEqual(['b']);
    expect(question?.kind === 'question' && question.selectedLabels).toEqual([]);
    expect(question?.kind === 'question' && question.correct).toBeNull();
    expect(source.items.find((item) => item.id === 'lesson-1')).toMatchObject({ read: true });
  });

  it('copies two weeks without unrelated days and does not share nested refs', () => {
    const copied = selectTemplate(source, { kind: 'weeks', weekIds: ['week-2', 'week-1'] });
    expect(copied.weeks.map((week) => week.name)).toEqual(['Tuần 1', 'Tuần 2']);
    expect(copied.items.filter((item) => item.kind === 'day').map((item) => item.name)).toEqual(['Ngày 1', 'Ngày 2']);
    const copiedLesson = copied.items.find((item) => item.kind === 'lesson');
    if (!copiedLesson || copiedLesson.kind !== 'lesson') throw new Error('missing lesson');
    copiedLesson.attachments[0].raw!.name = 'changed';
    expect(raw.name).toBe('guide.pdf');
  });

  it('rejects unknown and empty selections', () => {
    expect(() => selectTemplate(source, { kind: 'days', dayIds: [] })).toThrow('COPY_SELECTION_INVALID');
    expect(() => selectTemplate(source, { kind: 'weeks', weekIds: ['missing'] })).toThrow('COPY_SELECTION_INVALID');
  });
});
