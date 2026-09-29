import { useState } from 'react';
import type { Answers } from '../../domain/quiz';
import type { Question } from '../../domain/models';
import type { OnboardingLocale } from '../OnboardingShell';
import { learningCopy } from './learning-copy';

export interface QuizViewProps {
  questions: readonly Question[];
  onSubmit: (answers: Answers) => Promise<void> | void;
  pending?: boolean;
  error?: string;
  onBack?: () => void;
  locale: OnboardingLocale;
}

function valid(questions: readonly Question[]): boolean {
  return questions.length > 0 && new Set(questions.map((question) => question.id)).size === questions.length &&
    questions.every((question) => question.id && question.options.length >= 2 && question.options.length <= 10 &&
      question.correctLabels.length > 0 && question.correctLabels.every((label) =>
        /^[a-j]$/.test(label) && label.charCodeAt(0) - 97 < question.options.length));
}

export function QuizView({ questions, onSubmit, pending = false, error, onBack, locale }: QuizViewProps) {
  const t = learningCopy(locale);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(false);
  if (!valid(questions)) return <p role="alert">{t.invalidQuiz}</p>;
  const answered = questions.filter((question) => (answers[question.id]?.length ?? 0) > 0).length;
  const busy = pending || submitting;
  const select = (question: Question, label: string) => {
    if (busy) return;
    setAnswers((current) => {
      const before = current[question.id] ?? [];
      const next = question.correctLabels.length === 1 ? [label] :
        before.includes(label) ? before.filter((entry) => entry !== label) : [...before, label].sort();
      return { ...current, [question.id]: next };
    });
  };
  const submit = async () => {
    if (busy || answered !== questions.length) return;
    setSubmitting(true);
    setLocalError(false);
    try { await onSubmit(answers); }
    catch { setLocalError(true); }
    finally { setSubmitting(false); }
  };
  return <section className="v4-learning-quiz" aria-label={t.quizRegion}>
    {onBack && <button type="button" className="v4-secondary-button" onClick={onBack}>{t.backDay}</button>}
    <h1>{t.quizTitle}</h1>
    {questions.map((question, index) => <fieldset key={question.id} disabled={busy}>
      <legend>{t.question} {index + 1}: {question.content}</legend>
      {question.options.map((option, optionIndex) => {
        const label = String.fromCharCode(97 + optionIndex);
        const multi = question.correctLabels.length > 1;
        return <label key={label}><input type={multi ? 'checkbox' : 'radio'} name={question.id}
          checked={(answers[question.id] ?? []).includes(label)} onChange={() => select(question, label)} />{option}</label>;
      })}
    </fieldset>)}
    {(error || localError) && <p role="alert">{error ?? t.saveFailed}</p>}
    <div className="v4-quiz-actionbar"><p role="status">{t.answered} {answered}/{questions.length}</p>
      <button type="button" className="v4-primary-button" disabled={busy || answered !== questions.length}
        onClick={() => void submit()}>{busy ? t.saving : t.submit}</button></div>
  </section>;
}
