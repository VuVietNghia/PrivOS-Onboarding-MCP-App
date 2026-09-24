import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

type Role = 'admin' | 'employee';

interface Question {
  id: string;
  correct: readonly string[];
}

interface QuizResult {
  correct: number;
  total: number;
  details: readonly { id: string; isCorrect: boolean }[];
}

interface TemplateOption {
  text: string;
  correct: boolean;
}

interface TemplateQuestion {
  prompt: string;
  options: readonly TemplateOption[];
}

interface TemplateDay {
  id: string;
  title: string;
  lessons: readonly { content: string }[];
  questions: readonly TemplateQuestion[];
}

interface TemplateDraft {
  name: string;
  status: 'draft' | 'ready';
  days: readonly TemplateDay[];
}

interface TemplateReadiness {
  ready: boolean;
  issues: readonly { code: string; path: string }[];
}

interface RoadmapQuestion {
  prompt: string;
  explanation: string;
  options: readonly TemplateOption[];
}

interface RoadmapDay {
  id: string;
  title: string;
  objective: string;
  topics: readonly string[];
  activity: string;
  resources: readonly { label: string; url: string }[];
  attachment: string;
  questions: readonly RoadmapQuestion[];
}

interface RoadmapWeek {
  id: string;
  title: string;
  days: readonly RoadmapDay[];
}

interface BackendRoadmapDemo {
  templateName: string;
  weeks: readonly RoadmapWeek[];
}

interface HireRow {
  id: string;
  name: string;
  status: 'learning' | 'done' | 'error' | 'cancelled';
  position: 'backend' | 'support' | 'accounting';
  quiz: 'started' | 'pending';
}

interface HireFilters {
  query: string;
  status: 'all' | HireRow['status'];
  position: 'all' | HireRow['position'];
  summary: 'all' | 'learning' | 'done' | 'quiz-pending' | 'error';
}

interface PrivosDayItem {
  key: string;
  name: string;
  kind: 'day';
  parentKey: 'overview';
  stageKey: string;
  order: number;
}

interface PrivosWeekStage {
  key: string;
  name: string;
  order: number;
  items: readonly PrivosDayItem[];
}

interface BuilderWeek {
  id: string;
  title: string;
  dayNumbers: readonly number[];
}

interface RemovedBuilderWeek {
  weeks: readonly BuilderWeek[];
  removedDayNumbers: readonly number[];
  selectedWeekId: string;
}

interface PrototypeLogic {
  screenForRole(role: Role): string;
  answeredCount(answers: Readonly<Record<string, readonly string[]>>): number;
  canSubmit(
    questions: readonly Question[],
    answers: Readonly<Record<string, readonly string[]>>,
  ): boolean;
  gradeQuiz(
    questions: readonly Question[],
    answers: Readonly<Record<string, readonly string[]>>,
  ): QuizResult;
  createTemplateDraft(): TemplateDraft;
  validateTemplateDraft(draft: TemplateDraft): TemplateReadiness;
  createBackendRoadmapDemo(): BackendRoadmapDemo;
  createPrivosWeekStages(roadmap: BackendRoadmapDemo): readonly PrivosWeekStage[];
  progressPercent(completed: number, total: number): number;
  filterHireRows(rows: readonly HireRow[], filters: HireFilters): readonly string[];
  removeTemplateWeek(weeks: readonly BuilderWeek[], weekId: string): RemovedBuilderWeek | null;
}

function readPrototypeHtml(): string {
  const htmlUrl = new URL(
    '../.superpowers/brainstorm/2007-1790042739/content/preview-v4-interactive.html',
    import.meta.url,
  );
  return readFileSync(htmlUrl, 'utf8');
}

function loadPrototypeLogic(): PrototypeLogic {
  const html = readPrototypeHtml();
  const script = html.match(/<script id="prototype-logic">([\s\S]*?)<\/script>/u);

  expect(script, 'prototype logic script is missing').not.toBeNull();

  const context: { OnboardingPrototypeLogic?: PrototypeLogic } = {};
  runInNewContext(script?.[1] ?? '', context);

  expect(context.OnboardingPrototypeLogic, 'prototype logic API is missing').toBeDefined();
  return context.OnboardingPrototypeLogic as PrototypeLogic;
}

describe('onboarding v4 interactive prototype', () => {
  it('opens the correct workspace for each role', () => {
    const logic = loadPrototypeLogic();

    expect(logic.screenForRole('admin')).toBe('admin-hires');
    expect(logic.screenForRole('employee')).toBe('employee-roadmap');
  });

  it('enables submission only after every question has an answer', () => {
    const logic = loadPrototypeLogic();
    const questions: Question[] = [
      { id: 'q1', correct: ['b'] },
      { id: 'q2', correct: ['a', 'c', 'd'] },
      { id: 'q3', correct: ['a'] },
    ];

    expect(logic.answeredCount({ q1: ['b'], q2: ['a', 'c'] })).toBe(2);
    expect(logic.canSubmit(questions, { q1: ['b'], q2: ['a', 'c'] })).toBe(false);
    expect(logic.canSubmit(questions, { q1: ['b'], q2: ['a', 'c'], q3: ['a'] })).toBe(true);
  });

  it('grades multiple answers with all-or-nothing matching', () => {
    const logic = loadPrototypeLogic();
    const questions: Question[] = [
      { id: 'q1', correct: ['b'] },
      { id: 'q2', correct: ['a', 'c', 'd'] },
      { id: 'q3', correct: ['a'] },
    ];

    const result = logic.gradeQuiz(questions, {
      q1: ['b'],
      q2: ['a', 'c'],
      q3: ['a'],
    });

    expect(result).toEqual({
      correct: 2,
      total: 3,
      details: [
        { id: 'q1', isCorrect: true },
        { id: 'q2', isCorrect: false },
        { id: 'q3', isCorrect: true },
      ],
    });
  });

  it('starts a new template as an empty draft with one day', () => {
    const logic = loadPrototypeLogic();

    expect(logic.createTemplateDraft()).toEqual({
      name: '',
      status: 'draft',
      days: [
        {
          id: 'day-1',
          title: 'Ngày 1',
          lessons: [],
          questions: [],
        },
      ],
    });
  });

  it('blocks readiness until the template has learning content and every question has an answer', () => {
    const logic = loadPrototypeLogic();
    const empty = logic.createTemplateDraft();

    expect(logic.validateTemplateDraft(empty)).toEqual({
      ready: false,
      issues: [
        { code: 'template_name_required', path: 'name' },
        { code: 'lesson_required', path: 'days.day-1.lessons' },
      ],
    });

    const unanswered: TemplateDraft = {
      name: 'Kế toán thuế',
      status: 'draft',
      days: [
        {
          id: 'day-1',
          title: 'Ngày 1',
          lessons: [{ content: 'Quy trình khai thuế GTGT' }],
          questions: [
            {
              prompt: 'Hạn nộp tờ khai là khi nào?',
              options: [
                { text: 'Ngày 20', correct: false },
                { text: 'Ngày 30', correct: false },
              ],
            },
          ],
        },
      ],
    };

    expect(logic.validateTemplateDraft(unanswered)).toEqual({
      ready: false,
      issues: [{ code: 'question_answer_required', path: 'days.day-1.questions.0' }],
    });

    const ready: TemplateDraft = {
      ...unanswered,
      days: [
        {
          ...unanswered.days[0],
          questions: [
            {
              ...unanswered.days[0].questions[0],
              options: [
                { text: 'Ngày 20', correct: true },
                { text: 'Ngày 30', correct: false },
              ],
            },
          ],
        },
      ],
    };

    expect(logic.validateTemplateDraft(ready)).toEqual({ ready: true, issues: [] });
  });

  it('rejects an incomplete question even when an answer is selected', () => {
    const logic = loadPrototypeLogic();
    const malformed: TemplateDraft = {
      name: 'Kế toán thuế',
      status: 'draft',
      days: [
        {
          id: 'day-1',
          title: 'Ngày 1',
          lessons: [{ content: 'Quy trình khai thuế GTGT' }],
          questions: [
            {
              prompt: ' ',
              options: [
                { text: 'Ngày 20', correct: true },
                { text: ' ', correct: false },
              ],
            },
          ],
        },
      ],
    };

    expect(logic.validateTemplateDraft(malformed)).toEqual({
      ready: false,
      issues: [
        { code: 'question_prompt_required', path: 'days.day-1.questions.0.prompt' },
        { code: 'question_options_required', path: 'days.day-1.questions.0.options' },
      ],
    });
  });

  it('builds the complete five-phase backend training roadmap', () => {
    const logic = loadPrototypeLogic();
    const roadmap = logic.createBackendRoadmapDemo();
    const days = roadmap.weeks.flatMap((week) => week.days);

    expect(roadmap.templateName).toBe('Intern Backend Developer — Python & Odoo');
    expect(roadmap.weeks.map((week) => week.days.length)).toEqual([5, 5, 5, 5, 5]);
    expect(days).toHaveLength(25);
    expect(days[0]).toMatchObject({ id: 'day-1', title: 'Git Basics' });
    expect(roadmap.weeks[4]?.title).toBe('Tuần 4 · Odoo Backend');
    expect(days[20]).toMatchObject({ id: 'day-21', title: 'Odoo Architecture and Module Setup' });
    expect(days[24]).toMatchObject({ id: 'day-25', title: 'Odoo Mini Module Capstone' });
  });

  it('calculates readable progress and filters the people list from summary cards', () => {
    const logic = loadPrototypeLogic();
    const rows: HireRow[] = [
      { id: 'minh-anh', name: 'Trần Minh Anh minh.anh@acme.vn', status: 'learning', position: 'backend', quiz: 'pending' },
      { id: 'quoc-bao', name: 'Lê Quốc Bảo bao.le@acme.vn', status: 'done', position: 'support', quiz: 'started' },
      { id: 'thu-ha', name: 'Phạm Thu Hà ha.pham@acme.vn', status: 'error', position: 'support', quiz: 'pending' },
    ];

    expect(logic.progressPercent(8, 25)).toBe(32);
    expect(logic.progressPercent(1, 0)).toBe(0);
    expect(logic.filterHireRows(rows, {
      query: '', status: 'all', position: 'all', summary: 'quiz-pending',
    })).toEqual(['minh-anh']);
    expect(logic.filterHireRows(rows, {
      query: 'minh anh', status: 'learning', position: 'backend', summary: 'all',
    })).toEqual(['minh-anh']);
  });

  it('labels the admin dashboard and employee roadmap without ambiguous counters', () => {
    const html = readPrototypeHtml();

    expect(html).toContain('Quản lý onboarding');
    expect(html).toMatch(/<strong>14<\/strong><span>nhân sự<\/span>/u);
    expect(html).toMatch(/<strong>8<\/strong><span>nhân sự<\/span>/u);
    expect(html).toMatch(/<strong>5<\/strong><span>nhân sự<\/span>/u);
    expect(html).toMatch(/<strong>1<\/strong><span>hồ sơ<\/span>/u);
    expect(html).toContain('data-summary-filter="quiz-pending"');
    expect(html).toContain('8/25 ngày · 32%');
    expect(html).toContain('Ngày 1 · 2/2');
    expect(html).toContain('data-view-roadmap');
    expect(html).toContain('id="employee-week-list"');
    expect(html).toContain('Tuần 4 · Odoo Backend');
  });

  it('keeps compact navigation buttons named when their visible labels are hidden', () => {
    const html = readPrototypeHtml();

    expect(html).toContain('data-screen="admin-hires" aria-label="Nhân sự"');
    expect(html).toContain('data-screen="admin-provision" aria-label="Onboarding mới"');
    expect(html).toContain('data-screen="admin-templates" aria-label="Template"');
    expect(html).toContain('data-screen="employee-roadmap" aria-label="Lộ trình của tôi"');
  });

  it('keeps the selected-day action visible on mobile', () => {
    const html = readPrototypeHtml();

    expect(html).not.toContain('.focus-card { display:none; }');
    expect(html).toContain('id="open-focus-day"');
  });

  it('gives every roadmap day learning content, resources, an attachment, and two valid questions', () => {
    const logic = loadPrototypeLogic();
    const days = logic.createBackendRoadmapDemo().weeks.flatMap((week) => week.days);

    for (const day of days) {
      expect(day.objective.length).toBeGreaterThan(0);
      expect(day.topics.length).toBeGreaterThan(0);
      expect(day.activity.length).toBeGreaterThan(0);
      expect(day.resources.length).toBeGreaterThan(0);
      expect(day.attachment).toMatch(/\.pdf$/u);
      expect(day.questions).toHaveLength(2);
      for (const question of day.questions) {
        expect(question.prompt.length).toBeGreaterThan(0);
        expect(question.explanation.length).toBeGreaterThan(0);
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options.some((option) => option.correct)).toBe(true);
      }
    }
  });

  it('maps each roadmap week to one PrivOS stage containing its day items', () => {
    const logic = loadPrototypeLogic();
    const stages = logic.createPrivosWeekStages(logic.createBackendRoadmapDemo());

    expect(stages).toHaveLength(5);
    expect(stages.map((stage) => stage.items.length)).toEqual([5, 5, 5, 5, 5]);
    expect(stages[0]).toMatchObject({
      key: 'week-0',
      name: 'Tuần 0 · Git cơ bản',
      order: 0,
    });
    expect(stages[0]?.items[0]).toEqual({
      key: 'day-1',
      name: 'Git Basics',
      kind: 'day',
      parentKey: 'overview',
      stageKey: 'week-0',
      order: 0,
    });
    expect(stages[4]?.items[4]).toEqual({
      key: 'day-25',
      name: 'Odoo Mini Module Capstone',
      kind: 'day',
      parentKey: 'overview',
      stageKey: 'week-4',
      order: 4,
    });
  });

  it('removes a week with its days and selects the next remaining week', () => {
    const logic = loadPrototypeLogic();
    const weeks: BuilderWeek[] = [
      { id: 'week-0', title: 'Tuần 0', dayNumbers: [1, 2] },
      { id: 'week-1', title: 'Tuần 1', dayNumbers: [3, 4] },
      { id: 'week-2', title: 'Tuần 2', dayNumbers: [5] },
    ];

    expect(logic.removeTemplateWeek(weeks, 'week-1')).toEqual({
      weeks: [weeks[0], weeks[2]],
      removedDayNumbers: [3, 4],
      selectedWeekId: 'week-2',
    });
    expect(weeks).toHaveLength(3);
  });

  it('selects the previous week when deleting the last and preserves the sole week', () => {
    const logic = loadPrototypeLogic();
    const weeks: BuilderWeek[] = [
      { id: 'week-0', title: 'Tuần 0', dayNumbers: [1] },
      { id: 'week-1', title: 'Tuần 1', dayNumbers: [2] },
    ];

    expect(logic.removeTemplateWeek(weeks, 'week-1')).toEqual({
      weeks: [weeks[0]],
      removedDayNumbers: [2],
      selectedWeekId: 'week-0',
    });
    expect(logic.removeTemplateWeek([weeks[0]], 'week-0')).toBeNull();
    expect(logic.removeTemplateWeek(weeks, 'week-missing')).toBeNull();
  });
});
