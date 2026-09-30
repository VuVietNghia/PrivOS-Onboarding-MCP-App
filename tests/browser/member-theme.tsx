import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LazyBoundary } from '../../src/ui/lazy-boundary';
import DiagnosticsEntry from '../../src/ui/onboarding/dev/DiagnosticsEntry';
import { createRoot } from 'react-dom/client';
import { OnboardingI18nProvider, useUiLocale } from '../../src/ui/i18n/OnboardingI18nProvider';
import type { UiLocale } from '../../src/ui/i18n/locale';
import { OnboardingShell, type OnboardingTheme } from '../../src/ui/onboarding/views/OnboardingShell';
import { EmployeeRoadmapScreen } from '../../src/ui/onboarding/views/learning/EmployeeRoadmapScreen';
import type { Day, Lesson, Question } from '../../src/ui/onboarding/domain/models';
import { gradeDay, type Answers } from '../../src/ui/onboarding/domain/quiz';
import type { LoadedLearning, LearningService, SubmitQuizResult } from '../../src/ui/onboarding/ports/learning';
import type { FilesGateway } from '../../src/ui/onboarding/ports/files';
import type { Preferences } from '../../src/shared/ports/effects';
import '../../src/ui/onboarding/onboarding-v4.css';

type Scenario = 'ready' | 'empty' | 'load-error' | 'pending-submission';
type Operation = 'read' | 'quiz' | 'file-content' | 'file-download';
type GateMode = 'resolve' | 'reject' | 'hold';
type Surface = 'member' | 'missing-room' | 'reload';
const modes = new Map<Operation, GateMode>();
const pending = new Map<Operation, { resolve: () => void; reject: (error: Error) => void }>();
const calls: Record<Operation, number> = { read: 0, quiz: 0, 'file-content': 0, 'file-download': 0 };
let scenario: Scenario = 'ready';
const readLessons = new Set(['lesson-read']);
let saved: SubmitQuizResult | null = null;

async function gate(operation: Operation): Promise<void> {
  calls[operation] += 1;
  switch (modes.get(operation) ?? 'resolve') {
    case 'resolve': return;
    case 'reject': throw new Error('FIXTURE_REQUEST_FAILED');
    case 'hold': return new Promise<void>((resolve, reject) => pending.set(operation, { resolve, reject }));
  }
}

const day: Day = { id: 'day-3', kind: 'day', name: 'Day 3 — Embedded UI and host context', stageId: 'week-1', order: 3,
  parentId: null, content: 'Connect the React interface to host-provided room and actor context while keeping the embedded experience accessible.' };
const fileName = 'Embedded interface reference and accessible theme controls documentation with a deliberately long filename.md';
const lessons: Lesson[] = [
  { id: 'lesson-ui', kind: 'lesson', name: 'React UI inside the MCP host', stageId: 'week-1', order: 0, parentId: day.id,
    content: '## Learn\n\n- Read room, user, and theme context through the supported host SDK.\n- Connect UI actions to tools and render loading, empty, and error states.\n- Account for iframe sizing, keyboard access, and host theme changes.\n\n## Practice\n\nBuild a small status view that loads from the MCP tool, supports retry, and works at narrow widths.\n\n## Deliverable\n\nAn embedded screen with accessible controls and a clear loading-to-result flow.\n\n[Reference documentation](https://example.com/docs)',
    attachments: [], videos: ['https://example.com/video'], read: false },
  { id: 'lesson-read', kind: 'lesson', name: 'Reference files', stageId: 'week-1', order: 1, parentId: day.id,
    content: 'Open the attached Markdown and check the download action.', attachments: [{ id: 'file-1', name: fileName, mimeType: 'text/markdown' }],
    videos: [], read: true },
];
const questions: Question[] = [
  { id: 'q1', kind: 'question', name: 'Single answer', stageId: 'week-1', order: 2, parentId: day.id, content: 'Choose one answer',
    options: ['A', 'B'], correctLabels: ['b'], explanation: 'B is correct.', selectedLabels: [], correct: null },
  { id: 'q2', kind: 'question', name: 'Multiple answers', stageId: 'week-1', order: 3, parentId: day.id, content: 'Choose multiple answers',
    options: ['C', 'D', 'E'], correctLabels: ['a', 'c'], explanation: 'C and E are correct.', selectedLabels: [], correct: null },
];

function loaded(hireId = 'hire-1'): LoadedLearning {
  return {
    hire: { id: hireId, employeeId: 'fixture-member', name: 'Member', positionId: 'position-1',
      positionName: hireId === 'hire-1' ? 'Embedded UI Engineer' : 'Quality Engineer', totalDays: 1, startDate: '2026-09-30',
      roadmapListId: 'fixture-roadmap', status: saved ? 'done' : 'learning', doneDays: saved ? 1 : 0,
      scores: saved?.hire.scores ?? {}, errorCode: null, pendingAction: null },
    roadmap: { overviewId: 'overview', templateListId: 'template', tree: { weeks: [{ id: 'week-1', name: 'Week 1', order: 0 }],
      items: [day, ...lessons.map((lesson) => ({ ...lesson, read: readLessons.has(lesson.id) })), ...questions] } },
    pendingSubmission: scenario === 'pending-submission' ? { dayId: day.id, operationId: 'fixture-attempt', answeredQuestions: 2 } : null,
  };
}

function result(hireId: string, answers: Answers): SubmitQuizResult {
  const grade = gradeDay(questions, answers);
  const hire = loaded(hireId).hire;
  saved = { hire: { ...hire, scores: { '3': { first: `${grade.score}/${grade.total}`, attempts: [`${grade.score}/${grade.total}`] } } }, grade, attempt: 1 };
  return saved;
}

const learning: LearningService = {
  listMine: async () => {
    if (scenario === 'load-error') throw new Error('FIXTURE_LOAD_FAILED');
    return scenario === 'empty' ? [] : ['hire-1', 'hire-2'].map((hireId) => ({ hireId, positionName: loaded(hireId).hire.positionName,
      startDate: '2026-09-30', status: 'learning', doneDays: 0, totalDays: 1 }));
  },
  load: async (hireId) => loaded(hireId),
  markRead: async (hireId, lessonId) => { await gate('read'); readLessons.add(lessonId); return loaded(hireId); },
  submit: async ({ hireId, answers }) => { await gate('quiz'); return result(hireId, answers); },
  resume: async (hireId) => { await gate('quiz'); scenario = 'ready'; return result(hireId, { q1: ['b'], q2: ['a', 'c'] }); },
};
const files: FilesGateway = {
  folder: async () => { throw new Error('UNUSED_FIXTURE_OPERATION'); },
  upload: async () => { throw new Error('UNUSED_FIXTURE_OPERATION'); },
  metadata: async () => { throw new Error('UNUSED_FIXTURE_OPERATION'); },
  move: async () => { throw new Error('UNUSED_FIXTURE_OPERATION'); },
  open: async (_id, intent) => gate(intent === 'view' ? 'file-content' : 'file-download'),
  content: async (fileId) => {
    await gate('file-content');
    const text = '# Embedded interface reference\n\n[Accessible controls](https://example.com/controls)\n\nTheme changes keep the preview open.';
    return { fileId, name: fileName, mimeType: 'text/markdown', text, blob: new Blob([text], { type: 'text/markdown' }) };
  },
  download: async () => gate('file-download'),
};
const services = { learning, ids: { next: () => 'fixture-attempt' } };
const preferences: Preferences = { get: async () => undefined, set: async () => {} };

interface FixtureControl {
  setSurface(surface: Surface): void;
  setTheme(theme: OnboardingTheme): void;
  setLocale(locale: UiLocale): void;
  setScenario(value: Scenario): void;
  setGate(operation: Operation, mode: GateMode): void;
  release(operation: Operation, success: boolean): void;
  calls: Readonly<Record<Operation, number>>;
}
declare global { interface Window { __memberTheme: FixtureControl } }

function FixtureBody({ theme: initialTheme }: { theme: OnboardingTheme }) {
  const [theme, setTheme] = useState(initialTheme);
  const [surface, setSurface] = useState<Surface>('member');
  const { t } = useTranslation('common');
  const [revision, setRevision] = useState(0);
  const { locale, setLocale } = useUiLocale();
  useEffect(() => {
    window.__memberTheme = {
      setTheme, setLocale, setSurface, calls,
      setScenario: (value) => {
        scenario = value;
        if (value === 'ready') { readLessons.clear(); readLessons.add('lesson-read'); saved = null; }
        setRevision((value) => value + 1);
      },
      setGate: (operation, mode) => modes.set(operation, mode),
      release: (operation, success) => {
        const request = pending.get(operation);
        pending.delete(operation);
        if (success) request?.resolve(); else request?.reject(new Error('FIXTURE_REQUEST_FAILED'));
      },
    };
  }, [setLocale]);
  useEffect(() => {
    const shot = new URLSearchParams(window.location.search).get('shot');
    if (shot !== 'day' && shot !== 'quiz' && shot !== 'file') return;
    const run = async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
      document.querySelector<HTMLButtonElement>('.v4-learning-week li button')?.click();
      if (shot === 'day') return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      if (shot === 'quiz') {
        document.querySelector<HTMLButtonElement>('.v4-learning-day > .v4-primary-button')?.click();
        return;
      }
      const open = document.querySelector<HTMLButtonElement>('.v4-attachment-list button');
      open?.focus();
      open?.click();
    };
    void run();
  }, []);
  if (surface === 'missing-room') return <div className="onboarding-v4" data-theme-mode={theme} lang={locale}>
    <div className="v4-recovery"><p>{t('fallback.roomRequired')}</p></div>
  </div>;
  if (surface === 'reload') return <LazyBoundary theme={theme === 'brand' ? 'dark' : theme}
    copy={{ recovery: t('lazy.recovery'), reload: t('lazy.reload') }}
    logger={{ event: () => {} }} reloadPage={{ reload: () => {} }}><BrokenChunk /></LazyBoundary>;
  return <><OnboardingShell role="employee" roomId="theme-regression-fixture" screen="roadmap" onNavigate={() => {}}
    theme={theme} onThemeChange={setTheme} locale={locale} onLocaleChange={setLocale}>
    <EmployeeRoadmapScreen key={revision} services={services} filesGateway={files} />
    <section style={{ marginTop: 24 }} aria-label="Native control fixture"><label>Choose a reference file <input type="file" /></label></section>
  </OnboardingShell><DiagnosticsEntry roomId="theme-regression-fixture" userId="fixture-member" admin={false} theme={theme} /></>;
}

function BrokenChunk(): never { throw new Error('FIXTURE_CHUNK_FAILURE'); }

export function MemberThemeFixture({ theme, locale }: { theme: OnboardingTheme; locale: UiLocale }) {
  return <OnboardingI18nProvider userId="fixture-member" preferences={preferences} hostLocale={locale}>
    <FixtureBody theme={theme} />
  </OnboardingI18nProvider>;
}

const root = document.getElementById('root');
if (!root) throw new Error('FIXTURE_ROOT_MISSING');
const requestedTheme = new URLSearchParams(window.location.search).get('theme');
const initialTheme: OnboardingTheme = requestedTheme === 'light' || requestedTheme === 'brand' ? requestedTheme : 'dark';
createRoot(root).render(<MemberThemeFixture theme={initialTheme} locale="en" />);
