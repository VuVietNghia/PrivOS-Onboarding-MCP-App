import { useState } from 'react';
import type { Answers } from '../../domain/quiz';
import type { Question } from '../../domain/models';

export interface QuizViewProps {
  questions: readonly Question[];
  onSubmit: (answers: Answers) => Promise<void> | void;
  pending?: boolean;
  error?: string;
  onBack?: () => void;
}

function valid(questions: readonly Question[]): boolean {
  return questions.length > 0 && new Set(questions.map((question) => question.id)).size === questions.length &&
    questions.every((question) => question.id && question.options.length >= 2 && question.options.length <= 10 &&
      question.correctLabels.length > 0 && question.correctLabels.every((label) =>
        /^[a-j]$/.test(label) && label.charCodeAt(0) - 97 < question.options.length));
}

export function QuizView({ questions, onSubmit, pending = false, error, onBack }: QuizViewProps) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(false);
  if (!valid(questions)) return <p role="alert">Dữ liệu quiz không hợp lệ. Liên hệ HR.</p>;
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
  return <section aria-label="Làm quiz">
    {onBack && <button type="button" onClick={onBack}>Về ngày học</button>}
    <h1>Quiz</h1><p role="status">Đã trả lời {answered}/{questions.length}</p>
    {questions.map((question, index) => <fieldset key={question.id} disabled={busy}>
      <legend>Câu {index + 1}: {question.content}</legend>
      {question.options.map((option, optionIndex) => {
        const label = String.fromCharCode(97 + optionIndex);
        const multi = question.correctLabels.length > 1;
        return <label key={label}><input type={multi ? 'checkbox' : 'radio'} name={question.id}
          checked={(answers[question.id] ?? []).includes(label)} onChange={() => select(question, label)} />{option}</label>;
      })}
    </fieldset>)}
    {(error || localError) && <p role="alert">{error ?? 'Không lưu được bài làm. Thử lại.'}</p>}
    <button type="button" disabled={busy || answered !== questions.length} onClick={() => void submit()}>{busy ? 'Đang lưu…' : 'Nộp bài'}</button>
  </section>;
}
