import type { FilesGateway } from '../../data/files';
import type { Day, Lesson, Question } from '../../domain/models';
import { AttachmentList } from '../../components/AttachmentList';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { OnboardingLocale } from '../OnboardingShell';
import { learningCopy } from './learning-copy';

export interface DayLearningViewProps {
  day: Day;
  children: readonly (Lesson | Question)[];
  filesGateway?: FilesGateway;
  pendingLessonId?: string;
  error?: string;
  onRead: (lessonId: string) => void;
  onQuiz: () => void;
  onBack: () => void;
  locale: OnboardingLocale;
}

export function DayLearningView({ day, children, filesGateway, pendingLessonId, error, onRead, onQuiz, onBack, locale }: DayLearningViewProps) {
  const t = learningCopy(locale);
  const lessons = children.filter((item): item is Lesson => item.kind === 'lesson').sort((a, b) => a.order - b.order);
  const questions = children.filter((item): item is Question => item.kind === 'question');
  return <section className="v4-learning-day" aria-label={`${t.dayRegion} ${day.name}`}>
    <button type="button" className="v4-secondary-button" onClick={onBack}>{t.backRoadmap}</button>
    <h1>{day.name}</h1><div className="v4-markdown"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{day.content}</ReactMarkdown></div>
    {error && <p role="alert">{error}</p>}
    {!lessons.length && !questions.length && <p>{t.emptyDay}</p>}
    {lessons.map((lesson) => <article key={lesson.id}>
      <h2>{lesson.name}</h2><div className="v4-markdown"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{lesson.content}</ReactMarkdown></div>
      {lesson.videos.filter((url) => { try { return new URL(url).protocol === 'https:'; } catch { return false; } })
        .map((url) => <p key={url}><a href={url} target="_blank" rel="noopener noreferrer">{t.openVideo}</a></p>)}
      {filesGateway && <AttachmentList files={lesson.attachments} gateway={filesGateway} locale={locale} />}
      <button type="button" disabled={lesson.read || pendingLessonId === lesson.id}
        onClick={() => onRead(lesson.id)}>{lesson.read ? t.read : pendingLessonId === lesson.id ? t.saving : t.markRead}</button>
    </article>)}
    {questions.length > 0 && <button type="button" className="v4-primary-button" onClick={onQuiz}>{t.takeQuiz}</button>}
  </section>;
}
