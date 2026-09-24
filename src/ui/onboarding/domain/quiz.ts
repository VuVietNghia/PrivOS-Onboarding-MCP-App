import type { Question } from './models';

export type Answers = Readonly<Record<string, readonly string[]>>;

export interface GradeResult {
  score: number;
  total: number;
  results: { itemId: string; correct: boolean; correctLabels: string[]; explanation: string }[];
}

function validLabels(labels: readonly string[], optionCount: number): boolean {
  return labels.every((label) => /^[a-j]$/.test(label) && label.charCodeAt(0) - 97 < optionCount);
}

export function gradeDay(questions: readonly Question[], answers: Answers): GradeResult {
  if (questions.length === 0 || new Set(questions.map((question) => question.id)).size !== questions.length) {
    throw new Error('QUIZ_INVALID');
  }
  const results: GradeResult['results'] = [];
  for (const question of questions) {
    const correctLabels = question.correctLabels;
    if (!question.id || question.options.length < 2 || question.options.length > 10 ||
      correctLabels.length === 0 || new Set(correctLabels).size !== correctLabels.length ||
      !validLabels(correctLabels, question.options.length)) throw new Error('QUIZ_INVALID');

    const selected = answers[question.id];
    if (selected === undefined) throw new Error('QUIZ_INCOMPLETE');
    if (!Array.isArray(selected) || !validLabels(selected, question.options.length)) throw new Error('QUIZ_INVALID');
    if (selected.length === 0) throw new Error('QUIZ_INCOMPLETE');
    const selectedSet = new Set(selected);
    const correct = selectedSet.size === correctLabels.length && correctLabels.every((label) => selectedSet.has(label));
    results.push({ itemId: question.id, correct, correctLabels: [...correctLabels], explanation: question.explanation });
  }
  if (Object.keys(answers).some((id) => !questions.some((question) => question.id === id))) throw new Error('QUIZ_INVALID');
  return { score: results.filter((result) => result.correct).length, total: questions.length, results };
}
