import type { GradeResult } from '../../domain/quiz';
import type { Question } from '../../domain/models';
import { useTranslation } from 'react-i18next';
import { formatList } from '../../../i18n/formatters';
import { parseLocale } from '../../../i18n/locale';

export interface QuizResultProps {
  questions: readonly Question[];
  grade: GradeResult;
  attempts: readonly string[];
  firstScore: string;
  onRetake: () => void;
  onBack?: () => void;
}

export function QuizResult({ questions, grade, attempts, firstScore, onRetake, onBack }: QuizResultProps) {
  const { t, i18n } = useTranslation('learning');
  const locale = parseLocale(i18n.resolvedLanguage) ?? 'vi';
  const questionById = new Map(questions.map((question) => [question.id, question]));
  if (grade.total !== questions.length || grade.results.length !== questions.length ||
      grade.results.some((result) => !questionById.has(result.itemId))) return <p role="alert">{t('result.invalid')}</p>;
  return <section className="v4-quiz-result" aria-label={t('result.region')}>
    <h1>{t('result.attempt', { count: attempts.length })}</h1><strong>{grade.score}/{grade.total}</strong>
    <p>{t('result.firstScore', { score: firstScore })}</p><p>{t('result.attempts', { attempts: attempts.join(' · ') })}</p>
    <ol>{grade.results.map((result) => {
      const question = questionById.get(result.itemId);
      if (!question) return null;
      const correct = result.correctLabels.map((label) => question.options[label.charCodeAt(0) - 97]).filter(Boolean);
      return <li key={result.itemId}><h2>{question.content}</h2>
        <p>{result.correct ? t('result.correct') : t('result.incorrect')}</p>
        <p>{t('result.correctAnswer', { answers: formatList(correct, locale) })}</p>
        {result.explanation && <p>{result.explanation}</p>}
      </li>;
    })}</ol>
    <button type="button" className="v4-primary-button" onClick={onRetake}>{t('result.retake')}</button>
    {onBack && <button type="button" className="v4-secondary-button" onClick={onBack}>{t('result.back')}</button>}
  </section>;
}
