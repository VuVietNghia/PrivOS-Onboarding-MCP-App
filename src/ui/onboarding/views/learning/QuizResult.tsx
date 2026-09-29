import type { GradeResult } from '../../domain/quiz';
import type { Question } from '../../domain/models';
import type { OnboardingLocale } from '../OnboardingShell';
import { learningCopy } from './learning-copy';

export interface QuizResultProps {
  questions: readonly Question[];
  grade: GradeResult;
  attempts: readonly string[];
  firstScore: string;
  onRetake: () => void;
  onBack?: () => void;
  locale: OnboardingLocale;
}

export function QuizResult({ questions, grade, attempts, firstScore, onRetake, onBack, locale }: QuizResultProps) {
  const t = learningCopy(locale);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  if (grade.total !== questions.length || grade.results.length !== questions.length ||
      grade.results.some((result) => !questionById.has(result.itemId))) return <p role="alert">{t.invalidResult}</p>;
  return <section className="v4-quiz-result" aria-label={t.resultRegion}>
    <h1>{t.resultAttempt} {attempts.length}</h1><strong>{grade.score}/{grade.total}</strong>
    <p>{t.firstScore}: {firstScore}</p><p>{t.attempts}: {attempts.join(' · ')}</p>
    <ol>{grade.results.map((result) => {
      const question = questionById.get(result.itemId);
      if (!question) return null;
      const correct = result.correctLabels.map((label) => question.options[label.charCodeAt(0) - 97]).filter(Boolean);
      return <li key={result.itemId}><h2>{question.content}</h2>
        <p>{result.correct ? t.correct : t.incorrect}</p>
        <p>{t.correctAnswer}: {correct.join(', ')}</p>
        {result.explanation && <p>{result.explanation}</p>}
      </li>;
    })}</ol>
    <button type="button" className="v4-primary-button" onClick={onRetake}>{t.retake}</button>
    {onBack && <button type="button" className="v4-secondary-button" onClick={onBack}>{t.backDay}</button>}
  </section>;
}
