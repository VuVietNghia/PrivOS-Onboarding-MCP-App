import type { GradeResult } from '../../domain/quiz';
import type { Question } from '../../domain/models';

export interface QuizResultProps {
  questions: readonly Question[];
  grade: GradeResult;
  attempt: number;
  firstScore: string;
  onRetake: () => void;
  onBack?: () => void;
}

export function QuizResult({ questions, grade, attempt, firstScore, onRetake, onBack }: QuizResultProps) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  if (grade.total !== questions.length || grade.results.length !== questions.length ||
      grade.results.some((result) => !questionById.has(result.itemId))) return <p role="alert">Kết quả quiz không hợp lệ.</p>;
  return <section aria-label="Kết quả quiz">
    <h1>Kết quả lần {attempt}</h1><strong>{grade.score}/{grade.total}</strong><p>Điểm lần đầu: {firstScore}</p>
    <ol>{grade.results.map((result) => {
      const question = questionById.get(result.itemId);
      if (!question) return null;
      const correct = result.correctLabels.map((label) => question.options[label.charCodeAt(0) - 97]).filter(Boolean);
      return <li key={result.itemId}><h2>{question.content}</h2>
        <p>{result.correct ? 'Đúng' : 'Chưa đúng'}</p>
        <p>Đáp án đúng: {correct.join(', ')}</p>
        {result.explanation && <p>{result.explanation}</p>}
      </li>;
    })}</ol>
    <button type="button" onClick={onRetake}>Làm lại</button>
    {onBack && <button type="button" onClick={onBack}>Về ngày học</button>}
  </section>;
}
