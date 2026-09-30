import type { ContentItem, Day, Lesson, Question } from '../../domain/models';
import type { OptionDraft } from '../../domain/template-draft';
import type { FileMetadata, FilesGateway } from '../../data/files';
import { QuestionEditor } from './QuestionEditor';
import { LessonAssetsEditor } from './LessonAssetsEditor';
import type { IdGenerator } from '../../../../shared/ports/effects';
import { useTranslation } from 'react-i18next';

interface DayEditorProps {
  day: Day;
  children: readonly (Lesson | Question)[];
  optionsByQuestion: Readonly<Record<string, OptionDraft[]>>;
  onUpdate: (item: ContentItem) => void;
  onRemove: (id: string) => void;
  onAddLesson: () => void;
  onAddQuestion: () => void;
  onQuestionChange: (question: Question, options: OptionDraft[]) => void;
  ids: IdGenerator;
  filesGateway?: FilesGateway;
  positionId?: string;
  onSelectFile?: (lessonId: string, file: File) => void;
  uploadDisabled?: boolean;
  onAttach: (lessonId: string, file: FileMetadata) => void;
  onUnlink: (lessonId: string, fileId: string) => void;
}

export function DayEditor({ day, children, optionsByQuestion, onUpdate, onRemove, onAddLesson, onAddQuestion, onQuestionChange, ids,
  filesGateway, positionId, onSelectFile, uploadDisabled, onAttach, onUnlink }: DayEditorProps) {
  const { t } = useTranslation('templates');
  return <div className="v4-builder-day-editor">
    <section className="v4-builder-section"><header><small>{t('day.section')}</small><h2>{t('day.heading', { count: day.order })}</h2></header>
      <label>{t('day.name')}<input id={`v4-builder-${day.id}-name`} value={day.name} onChange={(event) => onUpdate({ ...day, name: event.target.value })} /></label>
      <label>{t('day.goal')}<textarea value={day.content} onChange={(event) => onUpdate({ ...day, content: event.target.value })} /></label>
      <button type="button" disabled={uploadDisabled} onClick={() => onRemove(day.id)}>{t('day.delete')}</button>
    </section>
    <section className="v4-builder-section"><header><small>{t('day.contentSection')}</small><h2>{t('day.contentTitle')}</h2><button id={`v4-builder-${day.id}-items`} type="button" onClick={onAddLesson}>{t('day.addLesson')}</button></header>
      {children.filter((item): item is Lesson => item.kind === 'lesson').sort((a, b) => a.order - b.order).map((lesson) => <article key={lesson.id} className="v4-builder-entry">
        <div className="v4-builder-entry-head"><strong>{t('day.lesson')}</strong><button type="button" disabled={uploadDisabled} onClick={() => onRemove(lesson.id)}>{t('day.deleteLesson')}</button></div>
        <label>{t('day.lessonTitle')}<input id={`v4-builder-${lesson.id}-name`} value={lesson.name} onChange={(event) => onUpdate({ ...lesson, name: event.target.value })} /></label>
        <label>{t('day.markdown')}<textarea id={`v4-builder-${lesson.id}-content`} rows={6} value={lesson.content} onChange={(event) => onUpdate({ ...lesson, content: event.target.value })} /></label>
        <LessonAssetsEditor lesson={lesson} gateway={filesGateway} positionId={positionId} onSelectFile={onSelectFile} uploadDisabled={uploadDisabled} onAttach={onAttach} onUnlink={onUnlink} />
      </article>)}
    </section>
    <section className="v4-builder-section"><header><small>{t('day.quizSection')}</small><h2>{t('day.quizTitle')}</h2><button type="button" onClick={onAddQuestion}>{t('day.addQuestion')}</button></header>
      {children.filter((item): item is Question => item.kind === 'question').sort((a, b) => a.order - b.order).map((question) => <QuestionEditor key={question.id} question={question} options={optionsByQuestion[question.id] ?? []} onChange={onQuestionChange} onRemove={() => onRemove(question.id)} ids={ids} />)}
    </section>
  </div>;
}
