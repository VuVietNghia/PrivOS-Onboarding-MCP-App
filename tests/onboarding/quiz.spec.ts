import { describe, expect, it } from 'vitest';
import type { Question } from '../../src/ui/onboarding/domain/models';
import { gradeDay } from '../../src/ui/onboarding/domain/quiz';

function question(id: string, correctLabels: string[], optionCount = 3): Question {
  return { id, name: id, kind: 'question', stageId: 'week', parentId: 'day', order: 1,
    content: 'Choose', options: Array.from({ length: optionCount }, (_, index) => String.fromCharCode(65 + index)),
    correctLabels, explanation: `Why ${id}`, selectedLabels: [], correct: null };
}

describe('gradeDay', () => {
  it('grades exact sets regardless of answer order, with no partial credit', () => {
    expect(gradeDay([question('q1', ['a', 'c']), question('q2', ['b'])],
      { q1: ['c', 'a', 'a'], q2: ['b', 'c'] })).toEqual({ score: 1, total: 2, results: [
      { itemId: 'q1', correct: true, correctLabels: ['a', 'c'], explanation: 'Why q1' },
      { itemId: 'q2', correct: false, correctLabels: ['b'], explanation: 'Why q2' },
    ] });
  });

  it('accepts ten choices and sixty questions deterministically', () => {
    const questions = Array.from({ length: 60 }, (_, index) => question(`q${index}`, ['j'], 10));
    const answers = Object.fromEntries(questions.map(({ id }) => [id, ['j']]));
    expect(gradeDay(questions, answers)).toMatchObject({ score: 60, total: 60 });
    expect(gradeDay(questions, answers)).toEqual(gradeDay(questions, answers));
  });

  it('rejects missing answers instead of recording a zero', () => {
    expect(() => gradeDay([question('q1', ['a'])], {})).toThrow('QUIZ_INCOMPLETE');
    expect(() => gradeDay([question('q1', ['a'])], { q1: [] })).toThrow('QUIZ_INCOMPLETE');
  });

  it('rejects malformed questions and submitted labels', () => {
    expect(() => gradeDay([question('q1', ['a']), question('q1', ['b'])], { q1: ['a'] })).toThrow('QUIZ_INVALID');
    expect(() => gradeDay([question('q1', ['d'])], { q1: ['a'] })).toThrow('QUIZ_INVALID');
    expect(() => gradeDay([question('q1', ['a'])], { q1: ['d'] })).toThrow('QUIZ_INVALID');
    expect(() => gradeDay([question('q1', ['a'], 1)], { q1: ['a'] })).toThrow('QUIZ_INVALID');
    expect(() => gradeDay([question('q1', ['a'])], { q1: null } as unknown as Record<string, string[]>)).toThrow('QUIZ_INVALID');
  });
});
