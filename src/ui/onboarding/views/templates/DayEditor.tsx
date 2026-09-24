import type { ContentItem, Day, Lesson, Question } from '../../domain/models';
import type { OptionDraft } from '../../domain/template-draft';
import type { FileMetadata, FilesGateway } from '../../data/files';
import { QuestionEditor } from './QuestionEditor';
import { LessonAssetsEditor } from './LessonAssetsEditor';

interface DayEditorProps {
  day: Day;
  children: readonly (Lesson | Question)[];
  optionsByQuestion: Readonly<Record<string, OptionDraft[]>>;
  onUpdate: (item: ContentItem) => void;
  onRemove: (id: string) => void;
  onAddLesson: () => void;
  onAddQuestion: () => void;
  onQuestionChange: (question: Question, options: OptionDraft[]) => void;
  filesGateway?: FilesGateway;
  positionId?: string;
  onAttach: (lessonId: string, file: FileMetadata) => void;
  onUnlink: (lessonId: string, fileId: string) => void;
}

export function DayEditor({ day, children, optionsByQuestion, onUpdate, onRemove, onAddLesson, onAddQuestion, onQuestionChange,
  filesGateway, positionId, onAttach, onUnlink }: DayEditorProps) {
  return <div className="v4-builder-day-editor">
    <section className="v4-builder-section"><header><small>02 / Ngày học</small><h2>Ngày {day.order}</h2></header>
      <label>Tên ngày<input id={`v4-builder-${day.id}-name`} value={day.name} onChange={(event) => onUpdate({ ...day, name: event.target.value })} /></label>
      <label>Mục tiêu học tập<textarea value={day.content} onChange={(event) => onUpdate({ ...day, content: event.target.value })} /></label>
      <button type="button" onClick={() => onRemove(day.id)}>Xóa ngày</button>
    </section>
    <section className="v4-builder-section"><header><small>03 / Nội dung học</small><h2>Bài học và tài liệu</h2><button id={`v4-builder-${day.id}-items`} type="button" onClick={onAddLesson}>Thêm bài học</button></header>
      {children.filter((item): item is Lesson => item.kind === 'lesson').sort((a, b) => a.order - b.order).map((lesson) => <article key={lesson.id} className="v4-builder-entry">
        <div className="v4-builder-entry-head"><strong>Bài học</strong><button type="button" onClick={() => onRemove(lesson.id)}>Xóa bài học</button></div>
        <label>Tiêu đề bài học<input id={`v4-builder-${lesson.id}-name`} value={lesson.name} onChange={(event) => onUpdate({ ...lesson, name: event.target.value })} /></label>
        <label>Nội dung Markdown<textarea id={`v4-builder-${lesson.id}-content`} rows={6} value={lesson.content} onChange={(event) => onUpdate({ ...lesson, content: event.target.value })} /></label>
        <LessonAssetsEditor lesson={lesson} gateway={filesGateway} positionId={positionId} onAttach={onAttach} onUnlink={onUnlink} />
      </article>)}
    </section>
    <section className="v4-builder-section"><header><small>04 / Câu hỏi ôn tập</small><h2>Quiz trong ngày</h2><button type="button" onClick={onAddQuestion}>Thêm câu hỏi</button></header>
      {children.filter((item): item is Question => item.kind === 'question').sort((a, b) => a.order - b.order).map((question) => <QuestionEditor key={question.id} question={question} options={optionsByQuestion[question.id] ?? []} onChange={onQuestionChange} onRemove={() => onRemove(question.id)} />)}
    </section>
  </div>;
}
