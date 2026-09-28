import { useEffect, useMemo, useRef, useState } from 'react';
import type { FilesGateway } from '../../data/files';
import { describeError } from '../../domain/errors';
import type { Day, Lesson, Question } from '../../domain/models';
import type { Answers, GradeResult } from '../../domain/quiz';
import type { LoadedLearning } from '../../ports/learning';
import type { OnboardingServices } from '../../ports/ui-services';
import { DayLearningView } from './DayLearningView';
import { QuizResult } from './QuizResult';
import { QuizView } from './QuizView';
import { WeekRoadmap } from './WeekRoadmap';

export interface EmployeeRoadmapScreenProps {
  services: Pick<OnboardingServices, 'learning' | 'ids'>;
  filesGateway?: FilesGateway;
}

export function EmployeeRoadmapScreen({ services, filesGateway }: EmployeeRoadmapScreenProps) {
  const [loaded, setLoaded] = useState<LoadedLearning | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [view, setView] = useState<'roadmap' | 'day' | 'quiz' | 'result'>('roadmap');
  const [result, setResult] = useState<{ grade: GradeResult; attempt: number; firstScore: string } | null>(null);
  const [quizRevision, setQuizRevision] = useState(0);
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [pendingQuiz, setPendingQuiz] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoaded(null); setError(null);
    void services.learning.load().then((value) => { if (active) setLoaded(value); })
      .catch((cause: unknown) => { if (active) setError(describeError(cause).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [services]);

  const day = loaded?.roadmap.tree.items.find((item): item is Day => item.kind === 'day' && item.id === selectedDayId);
  const children = useMemo(() => loaded?.roadmap.tree.items.filter((item): item is Lesson | Question =>
    item.kind !== 'day' && item.parentId === selectedDayId) ?? [], [loaded, selectedDayId]);
  const questions = children.filter((item): item is Question => item.kind === 'question');

  const read = async (lessonId: string) => {
    if (!loaded || pendingLessonId) return;
    setPendingLessonId(lessonId); setError(null);
    try { setLoaded(await services.learning.markRead(loaded.hire.id, lessonId)); }
    catch (cause) { setError(describeError(cause).message); }
    finally { setPendingLessonId(null); }
  };
  const submit = async (answers: Answers) => {
    if (!loaded || !day || pendingQuiz) return;
    if (!operationId.current) operationId.current = services.ids.next();
    setPendingQuiz(true); setError(null);
    try {
      const saved = await services.learning.submit({ hireId: loaded.hire.id, dayId: day.id,
        operationId: operationId.current, answers });
      const firstScore = saved.hire.scores[String(day.order)]?.first ?? `${saved.grade.score}/${saved.grade.total}`;
      setResult({ grade: saved.grade, attempt: saved.attempt, firstScore });
      setLoaded(await services.learning.load());
      setView('result');
      operationId.current = null;
    } catch (cause) { setError(describeError(cause).message); throw cause; }
    finally { setPendingQuiz(false); }
  };

  if (loading) return <section className="v4-screen"><p role="status">Đang tải lộ trình</p></section>;
  if (!loaded) return <section className="v4-screen"><h1>Lộ trình của tôi</h1>{error ? <p role="alert">{error}</p> : <p>Bạn chưa có lộ trình onboarding trong room này.</p>}</section>;
  return <section className="v4-screen v4-learning-screen">
    {view === 'roadmap' && <WeekRoadmap roadmap={loaded.roadmap} hire={loaded.hire} selectedDayId={selectedDayId ?? undefined}
      onDay={(id) => { setSelectedDayId(id); setResult(null); setError(null); setView('day'); }} error={error ?? undefined} />}
    {view === 'day' && day && <DayLearningView day={day} children={children} filesGateway={filesGateway}
      pendingLessonId={pendingLessonId ?? undefined} error={error ?? undefined} onRead={(id) => void read(id)}
      onQuiz={() => { setError(null); setView('quiz'); }} onBack={() => setView('roadmap')} />}
    {view === 'quiz' && day && <QuizView key={`${day.id}:${quizRevision}`} questions={questions} pending={pendingQuiz}
      error={error ?? undefined} onSubmit={submit} onBack={() => setView('day')} />}
    {view === 'result' && day && result && <QuizResult questions={questions} grade={result.grade} attempt={result.attempt}
      firstScore={result.firstScore} onRetake={() => { setResult(null); setQuizRevision((value) => value + 1); setView('quiz'); }}
      onBack={() => setView('day')} />}
  </section>;
}
