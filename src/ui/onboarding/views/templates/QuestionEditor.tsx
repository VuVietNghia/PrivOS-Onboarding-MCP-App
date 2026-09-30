import type { Question } from '../../domain/models';
import { answerLabels, moveOption, removeOption, type OptionDraft } from '../../domain/template-draft';
import type { IdGenerator } from '../../../../shared/ports/effects';
import { useTranslation } from 'react-i18next';

interface QuestionEditorProps {
  question: Question;
  options: readonly OptionDraft[];
  onChange: (question: Question, options: OptionDraft[]) => void;
  onRemove: () => void;
  ids: IdGenerator;
}

export function QuestionEditor({ question, options, onChange, onRemove, ids }: QuestionEditorProps) {
  const { t } = useTranslation('templates');
  const change = (next: OptionDraft[], patch: Partial<Question> = {}) => onChange({ ...question, ...patch, options: next.map((option) => option.text), correctLabels: answerLabels(next) }, next);
  return <article className="v4-builder-entry">
    <div className="v4-builder-entry-head"><strong>{t('question.title')}</strong><button type="button" onClick={onRemove}>{t('question.delete')}</button></div>
    <label>{t('question.content')}<textarea id={`v4-builder-${question.id}-content`} value={question.content} onChange={(event) => change([...options], { content: event.target.value })} /></label>
    <div className="v4-builder-options">{options.map((option, index) => <div className="v4-builder-option" key={option.id}>
      <span>{String.fromCharCode(97 + index)}</span>
      <input id={index === 0 ? `v4-builder-${question.id}-options` : undefined} aria-label={t('question.option', { count: index + 1 })} value={option.text} onChange={(event) => change(options.map((entry) => entry.id === option.id ? { ...entry, text: event.target.value } : entry))} />
      <label><input type="checkbox" aria-label={t('question.correctAnswer', { count: index + 1 })} checked={option.correct} onChange={(event) => change(options.map((entry) => entry.id === option.id ? { ...entry, correct: event.target.checked } : entry))} />{t('question.correct')}</label>
      <button type="button" aria-label={t('question.moveUp', { count: index + 1 })} disabled={index === 0} onClick={() => change(moveOption(options, option.id, index - 1))}>↑</button>
      <button type="button" aria-label={t('question.moveDown', { count: index + 1 })} disabled={index === options.length - 1} onClick={() => change(moveOption(options, option.id, index + 1))}>↓</button>
      <button type="button" aria-label={t('question.removeOption', { count: index + 1 })} disabled={options.length <= 2} onClick={() => change(removeOption(options, option.id))}>×</button>
    </div>)}</div>
    <button type="button" disabled={options.length >= 10} onClick={() => change([...options, { id: `draft:${ids.next()}`, text: '', correct: false }])}>{t('question.addOption')}</button>
    <label>{t('question.explanation')}<textarea value={question.explanation} onChange={(event) => change([...options], { explanation: event.target.value })} /></label>
  </article>;
}
