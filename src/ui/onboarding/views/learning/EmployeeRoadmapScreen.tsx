import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilesGateway } from '../../data/files';
import type { Day, Lesson, Question } from '../../domain/models';
import type { Answers, GradeResult } from '../../domain/quiz';
import type { LoadedLearning, MemberRoadmapOption } from '../../ports/learning';
import type { OnboardingServices } from '../../ports/ui-services';
import { DayLearningView } from './DayLearningView';
import { QuizResult } from './QuizResult';
import { QuizView } from './QuizView';
import { WeekRoadmap } from './WeekRoadmap';
import { formatDateOnly } from '../../../i18n/formatters';
import { parseLocale } from '../../../i18n/locale';

export interface EmployeeRoadmapScreenProps {
  services: Pick<OnboardingServices, 'learning' | 'ids'>;
  filesGateway?: FilesGateway;
}

interface ReadyState {
  loaded: LoadedLearning;
  roadmaps: readonly MemberRoadmapOption[];
  selectedHireId: string;
}

interface ResultState {
  grade: GradeResult;
  firstScore: string;
  attempts: readonly string[];
}

type EmployeeScreenState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error' }
  | ({ kind: 'roadmap'; selectedDayId?: string } & ReadyState)
  | ({ kind: 'day'; dayId: string } & ReadyState)
  | ({ kind: 'quiz'; dayId: string } & ReadyState)
  | ({ kind: 'result'; dayId: string; result: ResultState } & ReadyState);

type ActionError = 'load' | 'save';

function dayContent(loaded: LoadedLearning, dayId: string): { day: Day; children: readonly (Lesson | Question)[] } | null {
  const day = loaded.roadmap.tree.items.find((item): item is Day => item.kind === 'day' && item.id === dayId);
  if (!day) return null;
  const children = loaded.roadmap.tree.items.filter((item): item is Lesson | Question =>
    item.kind !== 'day' && item.parentId === dayId);
  return { day, children };
}

function refreshRoadmaps(roadmaps: readonly MemberRoadmapOption[], loaded: LoadedLearning): readonly MemberRoadmapOption[] {
  return roadmaps.map((option) => option.hireId === loaded.hire.id ? {
    ...option,
    positionName: loaded.hire.positionName,
    startDate: loaded.hire.startDate,
    status: loaded.hire.status === 'done' ? 'done' : 'learning',
    doneDays: loaded.hire.doneDays,
    totalDays: loaded.hire.totalDays,
  } : option);
}

function applyLoaded(current: EmployeeScreenState, hireId: string, loaded: LoadedLearning): EmployeeScreenState {
  switch (current.kind) {
    case 'loading':
    case 'empty':
    case 'error':
      return current;
    case 'roadmap':
    case 'day':
    case 'quiz':
    case 'result':
      return current.selectedHireId === hireId
        ? { ...current, loaded, roadmaps: refreshRoadmaps(current.roadmaps, loaded) }
        : current;
  }
}

export function EmployeeRoadmapScreen({ services, filesGateway }: EmployeeRoadmapScreenProps) {
  const { t, i18n } = useTranslation('learning');
  const locale = parseLocale(i18n.resolvedLanguage) ?? 'vi';
  const [state, setState] = useState<EmployeeScreenState>({ kind: 'loading' });
  const [quizRevision, setQuizRevision] = useState(0);
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null);
  const [pendingQuiz, setPendingQuiz] = useState(false);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const operationId = useRef<string | null>(null);
  const revision = useRef(0);
  const lessonAction = useRef(0);
  const quizAction = useRef(0);
  const actionErrorMessage = actionError === 'load' ? t('roadmap.loadFailed') : actionError === 'save' ? t('quiz.saveFailed') : undefined;

  const loadCatalog = useCallback(async () => {
    const request = ++revision.current;
    lessonAction.current += 1; quizAction.current += 1;
    setPendingLessonId(null); setPendingQuiz(false);
    setState({ kind: 'loading' }); setActionError(null); operationId.current = null;
    try {
      const roadmaps = await services.learning.listMine();
      if (request !== revision.current) return;
      const selectedHireId = roadmaps[0]?.hireId;
      if (!selectedHireId) { setState({ kind: 'empty' }); return; }
      const loaded = await services.learning.load(selectedHireId);
      if (request !== revision.current) return;
      if (!loaded) { setState({ kind: 'error' }); return; }
      setState({ kind: 'roadmap', loaded, roadmaps, selectedHireId });
    } catch {
      if (request === revision.current) setState({ kind: 'error' });
    }
  }, [services.learning]);

  useEffect(() => {
    void loadCatalog();
    return () => { revision.current += 1; lessonAction.current += 1; quizAction.current += 1; };
  }, [loadCatalog]);

  const read = async (lessonId: string) => {
    if (state.kind !== 'day' || pendingLessonId) return;
    const action = ++lessonAction.current;
    const request = revision.current;
    const hireId = state.loaded.hire.id;
    setPendingLessonId(lessonId); setActionError(null);
    try {
      const loaded = await services.learning.markRead(hireId, lessonId);
      setState((current) => applyLoaded(current, hireId, loaded));
    } catch { if (request === revision.current) setActionError('save'); }
    finally { if (action === lessonAction.current) setPendingLessonId(null); }
  };

  const submit = async (answers: Answers) => {
    if (state.kind !== 'quiz' || pendingQuiz) return;
    const content = dayContent(state.loaded, state.dayId);
    if (!content) { setActionError('load'); return; }
    if (!operationId.current) operationId.current = services.ids.next();
    const action = ++quizAction.current;
    const request = revision.current;
    const hireId = state.loaded.hire.id;
    setPendingQuiz(true); setActionError(null);
    try {
      const saved = await services.learning.submit({ hireId, dayId: content.day.id,
        operationId: operationId.current, answers });
      const score = `${saved.grade.score}/${saved.grade.total}`;
      const result = { grade: saved.grade, firstScore: saved.hire.scores[String(content.day.order)]?.first ?? score,
        attempts: saved.hire.scores[String(content.day.order)]?.attempts ?? [score] };
      const loaded = await services.learning.load(hireId);
      if (!loaded) return;
      operationId.current = null;
      if (request !== revision.current) { setState((current) => applyLoaded(current, hireId, loaded)); return; }
      setState({ kind: 'result', loaded, roadmaps: refreshRoadmaps(state.roadmaps, loaded), selectedHireId: state.selectedHireId,
        dayId: content.day.id, result });
    } catch (cause) { if (request === revision.current) setActionError('save'); throw cause; }
    finally { if (action === quizAction.current) setPendingQuiz(false); }
  };

  const selectRoadmap = async (hireId: string) => {
    if (state.kind !== 'roadmap') return;
    const roadmaps = state.roadmaps;
    const request = ++revision.current;
    setQuizRevision((value) => value + 1); setActionError(null); operationId.current = null; setState({ kind: 'loading' });
    try {
      const loaded = await services.learning.load(hireId);
      if (request !== revision.current) return;
      if (!loaded) { setState({ kind: 'error' }); return; }
      setState({ kind: 'roadmap', loaded, roadmaps, selectedHireId: hireId });
    } catch { if (request === revision.current) setState({ kind: 'error' }); }
  };

  const resume = async () => {
    if (state.kind !== 'roadmap' || !state.loaded.pendingSubmission || pendingQuiz) return;
    const pendingDay = dayContent(state.loaded, state.loaded.pendingSubmission.dayId)?.day;
    if (!pendingDay) { setActionError('load'); return; }
    const action = ++quizAction.current;
    const request = revision.current;
    const hireId = state.loaded.hire.id;
    setPendingQuiz(true); setActionError(null);
    try {
      const saved = await services.learning.resume(hireId);
      const score = `${saved.grade.score}/${saved.grade.total}`;
      const result = { grade: saved.grade, firstScore: saved.hire.scores[String(pendingDay.order)]?.first ?? score,
        attempts: saved.hire.scores[String(pendingDay.order)]?.attempts ?? [score] };
      const loaded = await services.learning.load(hireId);
      if (!loaded) return;
      if (request !== revision.current) { setState((current) => applyLoaded(current, hireId, loaded)); return; }
      setState({ kind: 'result', loaded, roadmaps: refreshRoadmaps(state.roadmaps, loaded), selectedHireId: state.selectedHireId,
        dayId: pendingDay.id, result });
    } catch { if (request === revision.current) setActionError('save'); }
    finally { if (action === quizAction.current) setPendingQuiz(false); }
  };

  switch (state.kind) {
    case 'loading': return <section className="v4-screen"><p role="status">{t('roadmap.loading')}</p></section>;
    case 'empty': return <section className="v4-screen"><h1>{t('roadmap.title')}</h1><p>{t('roadmap.empty')}</p></section>;
    case 'error': return <section className="v4-screen"><h1>{t('roadmap.title')}</h1><p role="alert">{t('roadmap.loadFailed')}</p>
      <button type="button" className="v4-primary-button" onClick={() => void loadCatalog()}>{t('roadmap.retry')}</button></section>;
    case 'roadmap': return <section className="v4-screen v4-learning-screen"><div className="v4-learning-controls">
      {state.roadmaps.length > 1 && <label>{t('roadmap.select')}<select aria-label={t('roadmap.select')} value={state.selectedHireId}
        onChange={(event) => void selectRoadmap(event.target.value)}>{state.roadmaps.map((option) => <option key={option.hireId} value={option.hireId}>
          {option.positionName} · {formatDateOnly(option.startDate, locale)} · {t(`roadmap.status.${option.status}`)}
        </option>)}</select></label>}
      {state.loaded.pendingSubmission && <button type="button" className="v4-primary-button" disabled={pendingQuiz}
        onClick={() => void resume()}>{pendingQuiz ? t('roadmap.saving') : t('roadmap.continueSaving')}</button>}
      </div><WeekRoadmap roadmap={state.loaded.roadmap} hire={state.loaded.hire} selectedDayId={state.selectedDayId}
        onDay={(dayId) => { revision.current += 1; setActionError(null); setState({ ...state, kind: 'day', dayId }); }}
        error={actionErrorMessage} /></section>;
    case 'day': {
      const content = dayContent(state.loaded, state.dayId);
      if (!content) return <section className="v4-screen"><p role="alert">{t('roadmap.loadFailed')}</p></section>;
      return <section className="v4-screen v4-learning-screen"><DayLearningView day={content.day} children={content.children} filesGateway={filesGateway}
        pendingLessonId={pendingLessonId ?? undefined} error={actionErrorMessage} onRead={(id) => void read(id)}
        onQuiz={() => { revision.current += 1; setActionError(null); setState({ ...state, kind: 'quiz' }); }}
        onBack={() => { revision.current += 1; setState({ kind: 'roadmap', loaded: state.loaded, roadmaps: state.roadmaps,
          selectedHireId: state.selectedHireId, selectedDayId: state.dayId }); }} /></section>;
    }
    case 'quiz': {
      const content = dayContent(state.loaded, state.dayId);
      if (!content) return <section className="v4-screen"><p role="alert">{t('roadmap.loadFailed')}</p></section>;
      const questions = content.children.filter((item): item is Question => item.kind === 'question');
      return <section className="v4-screen v4-learning-screen"><QuizView key={`${content.day.id}:${quizRevision}`} questions={questions}
        pending={pendingQuiz} error={actionErrorMessage} onSubmit={submit}
        onBack={() => { revision.current += 1; setState({ ...state, kind: 'day' }); }} /></section>;
    }
    case 'result': {
      const content = dayContent(state.loaded, state.dayId);
      if (!content) return <section className="v4-screen"><p role="alert">{t('roadmap.loadFailed')}</p></section>;
      const questions = content.children.filter((item): item is Question => item.kind === 'question');
      return <section className="v4-screen v4-learning-screen"><QuizResult questions={questions} grade={state.result.grade}
        attempts={state.result.attempts} firstScore={state.result.firstScore}
        onRetake={() => { revision.current += 1; setQuizRevision((value) => value + 1); setState({ ...state, kind: 'quiz' }); }}
        onBack={() => { revision.current += 1; setState({ kind: 'day', loaded: state.loaded, roadmaps: state.roadmaps,
          selectedHireId: state.selectedHireId, dayId: state.dayId }); }} /></section>;
    }
  }
}
