import type { Question } from '../../domain/models';
import { answerLabels, moveOption, removeOption, type OptionDraft } from '../../domain/template-draft';

interface QuestionEditorProps {
  question: Question;
  options: readonly OptionDraft[];
  onChange: (question: Question, options: OptionDraft[]) => void;
  onRemove: () => void;
}

export function QuestionEditor({ question, options, onChange, onRemove }: QuestionEditorProps) {
  const change = (next: OptionDraft[], patch: Partial<Question> = {}) => onChange({ ...question, ...patch, options: next.map((option) => option.text), correctLabels: answerLabels(next) }, next);
  return <article className="v4-builder-entry">
    <div className="v4-builder-entry-head"><strong>Câu hỏi</strong><button type="button" onClick={onRemove}>Xóa câu hỏi</button></div>
    <label>Nội dung câu hỏi<textarea id={`v4-builder-${question.id}-content`} value={question.content} onChange={(event) => change([...options], { content: event.target.value })} /></label>
    <div className="v4-builder-options">{options.map((option, index) => <div className="v4-builder-option" key={option.id}>
      <span>{String.fromCharCode(97 + index)}</span>
      <input id={index === 0 ? `v4-builder-${question.id}-options` : undefined} aria-label={`Lựa chọn ${index + 1}`} value={option.text} onChange={(event) => change(options.map((entry) => entry.id === option.id ? { ...entry, text: event.target.value } : entry))} />
      <label><input type="checkbox" aria-label={`Đáp án đúng ${index + 1}`} checked={option.correct} onChange={(event) => change(options.map((entry) => entry.id === option.id ? { ...entry, correct: event.target.checked } : entry))} />Đúng</label>
      <button type="button" aria-label={`Lên ${index + 1}`} disabled={index === 0} onClick={() => change(moveOption(options, option.id, index - 1))}>↑</button>
      <button type="button" aria-label={`Xuống ${index + 1}`} disabled={index === options.length - 1} onClick={() => change(moveOption(options, option.id, index + 1))}>↓</button>
      <button type="button" aria-label={`Xóa lựa chọn ${index + 1}`} disabled={options.length <= 2} onClick={() => change(removeOption(options, option.id))}>×</button>
    </div>)}</div>
    <button type="button" disabled={options.length >= 10} onClick={() => change([...options, { id: `draft:${crypto.randomUUID()}`, text: '', correct: false }])}>Thêm lựa chọn</button>
    <label>Giải thích sau khi nộp<textarea value={question.explanation} onChange={(event) => change([...options], { explanation: event.target.value })} /></label>
  </article>;
}
