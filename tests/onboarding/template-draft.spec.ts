import { describe, expect, it } from 'vitest';
import type { TemplateTree } from '../../src/ui/onboarding/domain/models';
import { answerLabels, moveOption, removeOption, type OptionDraft } from '../../src/ui/onboarding/domain/template-draft';
import { validateReady } from '../../src/ui/onboarding/domain/template-readiness';

const options: OptionDraft[] = [
  { id: 'a', text: 'A', correct: true },
  { id: 'b', text: 'B', correct: false },
];
const readyTree: TemplateTree = {
  weeks: [{ id: 'w', name: 'Tuần 1', order: 0 }],
  items: [
    { id: 'd', kind: 'day', name: 'Ngày 1', stageId: 'w', order: 1, parentId: null, content: 'Mục tiêu' },
    { id: 'l', kind: 'lesson', name: 'Bài học', stageId: 'w', order: 0, parentId: 'd', content: 'Nội dung', attachments: [], videos: [], read: false },
  ],
};

describe('template draft options', () => {
  it('keeps the correct option attached to its ID after reorder', () => {
    expect(answerLabels(moveOption(options, 'a', 1))).toEqual(['b']);
    expect(moveOption(options, 'a', 1).map((option) => option.id)).toEqual(['b', 'a']);
    expect(options.map((option) => option.id)).toEqual(['a', 'b']);
  });

  it('removes the correct answer when its option is deleted', () => {
    expect(answerLabels(removeOption(options, 'a'))).toEqual([]);
  });
});

describe('template readiness', () => {
  it('accepts a day with a valid lesson and no quiz', () => {
    expect(validateReady(readyTree, 'Kỹ sư')).toEqual([]);
  });

  it('requires a position name, a week, and a day', () => {
    const issues = validateReady({ weeks: [{ id: 'w', name: 'Tuần 1', order: 0 }], items: [] }, '');
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['POSITION_NAME', 'EMPTY_WEEK']));
  });

  it('rejects an empty day and an invalid lesson', () => {
    const issues = validateReady({ ...readyTree, items: [readyTree.items[0], { ...readyTree.items[1], name: '', content: '' }] }, 'Kỹ sư');
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['LESSON_TITLE', 'LESSON_CONTENT', 'EMPTY_DAY']));
  });

  it('validates 2 to 10 options, answer labels, and question content', () => {
    const question = { id: 'q', kind: 'question' as const, name: 'Câu 1', stageId: 'w', order: 1, parentId: 'd', content: '', options: ['A', ''], correctLabels: ['k'], explanation: '', selectedLabels: [], correct: null };
    const issues = validateReady({ ...readyTree, items: [readyTree.items[0], question] }, 'Kỹ sư');
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['QUESTION_CONTENT', 'OPTION_EMPTY', 'ANSWER_INVALID', 'EMPTY_DAY']));
    expect(validateReady({ ...readyTree, items: [readyTree.items[0], { ...question, content: 'Hỏi?', options: Array.from({ length: 11 }, (_, i) => String(i)), correctLabels: ['a'] }] }, 'Kỹ sư').map((issue) => issue.code)).toContain('OPTION_COUNT');
    expect(validateReady({ ...readyTree, items: [readyTree.items[0], { ...question, content: 'Hỏi?', options: ['A', 'B'], correctLabels: ['a', 'b'] }] }, 'Kỹ sư')).toEqual([]);
  });
});
