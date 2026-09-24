import type { Scores } from './models';

function keyForDay(dayNumber: number): string {
  if (!Number.isSafeInteger(dayNumber) || dayNumber <= 0) throw new Error('SCORES_INVALID');
  return String(dayNumber);
}

function fraction(score: string): number {
  const matched = /^(0|[1-9]\d*)\/([1-9]\d*)$/.exec(score);
  if (!matched) throw new Error('SCORES_INVALID');
  const numerator = Number(matched[1]);
  const denominator = Number(matched[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator > denominator) {
    throw new Error('SCORES_INVALID');
  }
  return numerator / denominator;
}

export function appendScore(scores: Scores, dayNumber: number, score: string): Scores {
  const key = keyForDay(dayNumber);
  fraction(score);
  const previous = scores[key];
  if (previous?.first === '—') throw new Error('SCORES_INVALID');
  const attempts = previous?.attempts ?? (previous ? [previous.first] : []);
  return { ...scores, [key]: {
    first: previous?.first ?? score,
    attempts: [...attempts, score],
  } };
}

export function completeLessonDay(scores: Scores, dayNumber: number): Scores {
  const key = keyForDay(dayNumber);
  if (scores[key]) return scores;
  return { ...scores, [key]: { first: '—' } };
}

export function countCompletedDays(scores: Scores, dayNumbers: readonly number[]): number {
  return [...new Set(dayNumbers.map(keyForDay))].filter((key) => Object.prototype.hasOwnProperty.call(scores, key)).length;
}

export function quizAverage(scores: Scores): number | null {
  const quizScores = Object.values(scores).filter((entry) => entry.first !== '—');
  if (quizScores.length === 0) return null;
  return quizScores.reduce((sum, entry) => sum + fraction(entry.first), 0) / quizScores.length;
}
