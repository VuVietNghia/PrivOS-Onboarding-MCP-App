import { describe, expect, it } from 'vitest';
import { appendScore, completeLessonDay, countCompletedDays, quizAverage } from '../../src/ui/onboarding/domain/scores';

describe('scores', () => {
  it('keeps the first score and appends retries without mutating history', () => {
    const original = { '1': { first: '1/2', attempts: ['1/2'] } };
    const updated = appendScore(original, 1, '2/2');
    expect(updated['1']).toEqual({ first: '1/2', attempts: ['1/2', '2/2'] });
    expect(original['1'].attempts).toEqual(['1/2']);
    expect(appendScore({}, 2, '0/2')['2']).toEqual({ first: '0/2', attempts: ['0/2'] });
    expect(appendScore({ '3': { first: '1/2' } }, 3, '2/2')['3']).toEqual({ first: '1/2', attempts: ['1/2', '2/2'] });
  });

  it('marks a lesson-only day once and does not create quiz attempts', () => {
    const completed = completeLessonDay({}, 2);
    expect(completed).toEqual({ '2': { first: '—' } });
    expect(completeLessonDay(completed, 2)).toEqual(completed);
    expect(completeLessonDay({ '2': { first: '1/2', attempts: ['1/2'] } }, 2)['2']).toEqual({ first: '1/2', attempts: ['1/2'] });
  });

  it('counts only actual distinct day numbers and excludes retries', () => {
    const scores = { '1': { first: '1/2', attempts: ['1/2', '2/2'] }, '3': { first: '—' }, '99': { first: '1/1' } };
    expect(countCompletedDays(scores, [1, 2, 3, 3])).toBe(2);
  });

  it('averages first quiz percentages and skips lesson markers', () => {
    expect(quizAverage({ '1': { first: '1/2' }, '2': { first: '—' }, '3': { first: '3/4', attempts: ['3/4', '4/4'] } })).toBe(0.625);
    expect(quizAverage({ '2': { first: '—' } })).toBeNull();
  });
});
