import type { McpApp } from '@privos_ai/app-react';
import { patchFields, queryItems, readAllItems, readItem, readListInfo } from '../data/v2-lists';
import { unwrapToolResult } from '../data/tool-result';
import type { HubItem } from '../domain/fields';
import type { ContentItem, Day, Hire, Lesson, Question, Roadmap, RoomBinding, Week } from '../domain/models';
import { gradeDay, type Answers, type GradeResult } from '../domain/quiz';
import { appendScore, completeLessonDay, countCompletedDays } from '../domain/scores';
import { parseHireItem, parseTemplateItems } from '../domain/v2-schemas';
import { resolveSelectLabels, resolveV2FieldIds, V2, V2_HIRE_FIELDS, V2_ROADMAP_FIELDS } from '../domain/v2-fields';

interface Loaded { hire: Hire; roadmap: Roadmap }
export interface SubmitQuizInput { userId: string; hireId: string; dayId: string; operationId: string; answers: Answers }
export interface SubmitQuizResult { hire: Hire; grade: GradeResult; attempt: number }
interface SubmissionJournal { version: 1; operationId: string; dayId: string; previousScores: string; answers: Record<string, string[]> }

const activeHires = new Set<string>();
const MAX_SERIALIZED_BYTES = 16_000;

function field(row: HubItem, fieldId: string): unknown {
  return row.customFields?.find((entry) => entry.fieldId === fieldId)?.value;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function serialized(value: unknown): string {
  const result = JSON.stringify(value);
  if (new TextEncoder().encode(result).byteLength > MAX_SERIALIZED_BYTES) throw new Error('SCORE_HISTORY_LIMIT');
  return result;
}
function journal(raw: unknown): SubmissionJournal | null {
  if (raw === undefined || raw === null || raw === '') return null;
  let value: unknown;
  try { value = JSON.parse(text(raw)) as unknown; } catch { throw new Error('SCORES_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SCORES_INVALID');
  const entry = value as Record<string, unknown>;
  if (entry.version !== 1 || typeof entry.operationId !== 'string' || typeof entry.dayId !== 'string' ||
      typeof entry.previousScores !== 'string' || !entry.answers || typeof entry.answers !== 'object' || Array.isArray(entry.answers)) throw new Error('SCORES_INVALID');
  const answers: Record<string, string[]> = {};
  for (const [id, answer] of Object.entries(entry.answers)) {
    if (!Array.isArray(answer) || !answer.every((label) => typeof label === 'string')) throw new Error('SCORES_INVALID');
    answers[id] = answer;
  }
  return { version: 1, operationId: entry.operationId, dayId: entry.dayId, previousScores: entry.previousScores, answers };
}

function sameJournal(actual: SubmissionJournal | null, expected: SubmissionJournal): boolean {
  return actual?.operationId === expected.operationId && actual.dayId === expected.dayId &&
    actual.previousScores === expected.previousScores && JSON.stringify(actual.answers) === JSON.stringify(expected.answers);
}

async function hireContext(app: McpApp, binding: RoomBinding) {
  const info = await readListInfo(app, binding.hiresListId);
  if (info.list.roomId !== binding.roomId) throw new Error('ROOM_MISMATCH');
  return { info, ids: resolveV2FieldIds(info.list.fieldDefinitions, V2_HIRE_FIELDS) };
}
function hireStatus(stages: { _id: string; name: string }[], stageId: string): 'learning' | 'done' {
  const stage = stages.find((entry) => entry._id === stageId)?.name;
  if (stage === 'Đang học') return 'learning';
  if (stage === 'Hoàn tất') return 'done';
  throw new Error('HIRE_NOT_ACTIVE');
}
async function ownHire(app: McpApp, binding: RoomBinding, userId: string, hireId: string) {
  const { info, ids } = await hireContext(app, binding);
  const row = await readItem(app, binding.hiresListId, hireId);
  if (!row.stageId) throw new Error('SCHEMA_DRIFT');
  const hire = parseHireItem(row, ids, hireStatus(info.stages, row.stageId));
  if (hire.employeeId !== userId || !hire.roadmapListId) throw new Error('HIRE_NOT_OWNED');
  if (hire.pendingAction === 'cancel') throw new Error('HIRE_CANCELLING');
  return { hire, row, ids, info };
}

async function loadRun(app: McpApp, binding: RoomBinding, runId: string): Promise<Roadmap> {
  const info = await readListInfo(app, runId);
  if (info.list.roomId !== binding.roomId || info.stages.length !== 1 || info.stages[0].name !== 'Nội dung') throw new Error('RUN_INVALID');
  const ids = resolveV2FieldIds(info.list.fieldDefinitions, V2_ROADMAP_FIELDS);
  const labels = resolveSelectLabels(info.list.fieldDefinitions);
  const rows = await readAllItems(app, runId);
  const logicalParent = (row: HubItem): string => {
    const value = field(row, ids[V2.parent]);
    if (typeof value !== 'string') throw new Error('RUN_INVALID');
    return value;
  };
  const kindLabel = (row: HubItem): string => {
    const raw = field(row, ids[V2.kind]);
    const value = typeof raw === 'object' && raw !== null && 'value' in raw ? raw.value : raw;
    return typeof value === 'string' ? labels[ids[V2.kind]]?.[value] ?? value : '';
  };
  const overviewRows = rows.filter((row) => field(row, ids[V2.source]) === '__overview__');
  if (overviewRows.length !== 1 || logicalParent(overviewRows[0]) !== '') throw new Error('RUN_INVALID');
  const overview = overviewRows[0];
  const weeks = rows.filter((row) => kindLabel(row) === 'Tuần').map((row): Week => {
    const order = field(row, ids[V2.order]);
    if (logicalParent(row) !== overview._id || typeof order !== 'number' || !Number.isInteger(order)) throw new Error('RUN_INVALID');
    if (!row.name) throw new Error('RUN_INVALID');
    return { id: row._id, name: row.name, order };
  }).sort((a, b) => a.order - b.order);
  const weekIds = new Set(weeks.map((week) => week.id));
  const contentRows = rows.filter((row) => row._id !== overview._id && !weekIds.has(row._id)).map((row) => {
    const parentId = logicalParent(row);
    if (!parentId) throw new Error('RUN_INVALID');
    return { ...row, parentId };
  });
  const parsed = parseTemplateItems(contentRows, ids, labels);
  const dayRows = parsed.filter((item): item is Day => item.kind === 'day');
  const dayWeek = new Map<string, string>();
  for (const day of dayRows) {
    const raw = contentRows.find((row) => row._id === day.id);
    if (!raw?.parentId || !weekIds.has(raw.parentId)) throw new Error('RUN_INVALID');
    dayWeek.set(day.id, raw.parentId);
  }
  const items = parsed.map((item): ContentItem => {
    const weekId = item.kind === 'day' ? dayWeek.get(item.id) : dayWeek.get(item.parentId ?? '');
    if (!weekId) throw new Error('RUN_INVALID');
    if (item.kind === 'day') return { ...item, stageId: weekId, parentId: null };
    const row = contentRows.find((entry) => entry._id === item.id);
    if (!row) throw new Error('RUN_INVALID');
    if (item.kind === 'lesson') return { ...item, stageId: weekId, read: field(row, ids[V2.read]) === true };
    const selected = text(field(row, ids[V2.selected]));
    const result = field(row, ids[V2.result]);
    const resultLabel = typeof result === 'string' ? labels[ids[V2.result]]?.[result] ?? result : '';
    return { ...item, stageId: weekId, selectedLabels: selected ? selected.split(',') : [],
      correct: resultLabel === 'Đúng' ? true : resultLabel === 'Sai' ? false : null };
  });
  return { overviewId: overview._id, templateListId: text(field(overview, ids[V2.template])), tree: { weeks, items } };
}

export async function loadMyRoadmap(app: McpApp, binding: RoomBinding, userId: string): Promise<Loaded | null> {
  if (!userId) throw new Error('HIRE_NOT_OWNED');
  const { info, ids } = await hireContext(app, binding);
  const candidates: Hire[] = [];
  for (const status of ['learning', 'done'] as const) {
    const stageName = status === 'learning' ? 'Đang học' : 'Hoàn tất';
    const stage = info.stages.find((entry) => entry.name === stageName);
    if (!stage) throw new Error('SCHEMA_DRIFT');
    let cursor: string | undefined;
    do {
      const page = await queryItems(app, binding.hiresListId, { stageId: stage._id, archived: false,
        customFields: [{ fieldId: ids[V2.employee], op: 'is', value: userId }] }, 100, cursor);
      for (const row of page.items) {
        const hire = parseHireItem(row, ids, status);
        if (hire.employeeId !== userId) throw new Error('HIRE_NOT_OWNED');
        candidates.push(hire);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  const hire = candidates.sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))[0];
  if (!hire) return null;
  if (!hire.roadmapListId) throw new Error('RUN_INVALID');
  return { hire, roadmap: await loadRun(app, binding, hire.roadmapListId) };
}

async function withHireLock<T>(hireId: string, operation: () => Promise<T>): Promise<T> {
  if (activeHires.has(hireId)) throw new Error('WRITE_CONFLICT');
  activeHires.add(hireId);
  try { return await operation(); } finally { activeHires.delete(hireId); }
}
function dayChildren(roadmap: Roadmap, dayId: string) {
  const day = roadmap.tree.items.find((item): item is Day => item.kind === 'day' && item.id === dayId);
  if (!day) throw new Error('DAY_NOT_FOUND');
  const children = roadmap.tree.items.filter((item): item is Lesson | Question => item.kind !== 'day' && item.parentId === dayId);
  if (!children.length) throw new Error('RUN_INVALID');
  return { day, children };
}
function completedDays(roadmap: Roadmap, scores: Hire['scores']): number {
  const days = roadmap.tree.items.filter((item): item is Day => item.kind === 'day');
  return countCompletedDays(scores, days.map((day) => day.order));
}
async function finishHireIfDone(app: McpApp, hireId: string, hire: Hire, stages: { _id: string; name: string }[]): Promise<void> {
  if (hire.doneDays < hire.totalDays || hire.status === 'done') return;
  const done = stages.find((stage) => stage.name === 'Hoàn tất');
  if (!done) throw new Error('SCHEMA_DRIFT');
  unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: hireId, stageId: done._id } }));
}

export async function markLessonRead(app: McpApp, binding: RoomBinding, userId: string, hireId: string, lessonId: string): Promise<Loaded> {
  return withHireLock(hireId, async () => {
    const context = await ownHire(app, binding, userId, hireId);
    if (journal(field(context.row, context.ids[V2.pendingSubmission]))) throw new Error('WRITE_CONFLICT');
    const runId = context.hire.roadmapListId!;
    const roadmap = await loadRun(app, binding, runId);
    const lesson = roadmap.tree.items.find((item): item is Lesson => item.kind === 'lesson' && item.id === lessonId);
    if (!lesson) throw new Error('LESSON_NOT_FOUND');
    const runInfo = await readListInfo(app, runId);
    const runIds = resolveV2FieldIds(runInfo.list.fieldDefinitions, V2_ROADMAP_FIELDS);
    if (!lesson.read) await patchFields(app, runId, lessonId, { [runIds[V2.read]]: true });
    const updatedRoadmap = await loadRun(app, binding, runId);
    const { day, children } = dayChildren(updatedRoadmap, lesson.parentId ?? '');
    const onlyLessons = children.every((item) => item.kind === 'lesson');
    const allRead = children.every((item) => item.kind === 'lesson' && item.read);
    if (onlyLessons && allRead) {
      const latest = await ownHire(app, binding, userId, hireId);
      if (journal(field(latest.row, latest.ids[V2.pendingSubmission]))) throw new Error('WRITE_CONFLICT');
      if (!latest.hire.scores[String(day.order)]) {
        const scores = completeLessonDay(latest.hire.scores, day.order);
        await patchFields(app, binding.hiresListId, hireId, { [latest.ids[V2.scores]]: serialized(scores),
          [latest.ids[V2.doneDays]]: completedDays(updatedRoadmap, scores) });
        const saved = await ownHire(app, binding, userId, hireId);
        if (serialized(saved.hire.scores) !== serialized(scores)) throw new Error('WRITE_CONFLICT');
      }
    }
    const current = await ownHire(app, binding, userId, hireId);
    await finishHireIfDone(app, hireId, current.hire, current.info.stages);
    return { hire: (await ownHire(app, binding, userId, hireId)).hire, roadmap: updatedRoadmap };
  });
}

export async function submitQuiz(app: McpApp, binding: RoomBinding, input: SubmitQuizInput): Promise<SubmitQuizResult> {
  return withHireLock(input.hireId, async () => {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.operationId)) throw new Error('QUIZ_INVALID');
    const context = await ownHire(app, binding, input.userId, input.hireId);
    const runId = context.hire.roadmapListId!;
    const roadmap = await loadRun(app, binding, runId);
    const { day, children } = dayChildren(roadmap, input.dayId);
    const questions = children.filter((item): item is Question => item.kind === 'question');
    const grade = gradeDay(questions, input.answers);
    const existingJournal = journal(field(context.row, context.ids[V2.pendingSubmission]));
    const lastOperation = field(context.row, context.ids[V2.lastSubmission]);
    if (lastOperation === input.operationId) {
      const lastScore = context.hire.scores[String(day.order)]?.attempts;
      if (!lastScore || lastScore[lastScore.length - 1] !== `${grade.score}/${grade.total}` ||
          questions.some((question) => {
            const saved = [...question.selectedLabels].sort();
            const supplied = [...(input.answers[question.id] ?? [])].sort();
            return JSON.stringify(saved) !== JSON.stringify(supplied);
          })) throw new Error('WRITE_CONFLICT');
      await finishHireIfDone(app, input.hireId, context.hire, context.info.stages);
      const hire = (await ownHire(app, binding, input.userId, input.hireId)).hire;
      return { hire, grade, attempt: hire.scores[String(day.order)]?.attempts?.length ?? 1 };
    }
    if (existingJournal && (existingJournal.operationId !== input.operationId || existingJournal.dayId !== day.id ||
      JSON.stringify(existingJournal.answers) !== JSON.stringify(input.answers))) throw new Error('WRITE_CONFLICT');
    const previousScores = existingJournal?.previousScores ?? serialized(context.hire.scores);
    if (serialized(context.hire.scores) !== previousScores) throw new Error('WRITE_CONFLICT');
    const score = `${grade.score}/${grade.total}`;
    const projectedScores = serialized(appendScore(context.hire.scores, day.order, score));
    const nextJournal: SubmissionJournal = existingJournal ?? { version: 1, operationId: input.operationId, dayId: day.id,
      previousScores, answers: Object.fromEntries(Object.entries(input.answers).map(([id, labels]) => [id, [...labels]])) };
    serialized(nextJournal);
    if (!existingJournal) {
      await patchFields(app, binding.hiresListId, input.hireId, { [context.ids[V2.pendingSubmission]]: serialized(nextJournal) });
    }
    const runInfo = await readListInfo(app, runId);
    const runIds = resolveV2FieldIds(runInfo.list.fieldDefinitions, V2_ROADMAP_FIELDS);
    const resultOptions = runInfo.list.fieldDefinitions.find((definition) => definition._id === runIds[V2.result])?.options ?? [];
    const reserved = await ownHire(app, binding, input.userId, input.hireId);
    if (!sameJournal(journal(field(reserved.row, reserved.ids[V2.pendingSubmission])), nextJournal) ||
      serialized(reserved.hire.scores) !== previousScores ||
      field(reserved.row, reserved.ids[V2.lastSubmission]) !== lastOperation) throw new Error('WRITE_CONFLICT');
    for (const result of grade.results) {
      const option = resultOptions.find((entry) => entry.value === (result.correct ? 'Đúng' : 'Sai'))?._id;
      if (!option) throw new Error('SCHEMA_DRIFT');
      await patchFields(app, runId, result.itemId, { [runIds[V2.selected]]: [...input.answers[result.itemId]].sort().join(','),
        [runIds[V2.result]]: option });
    }
    const beforeFinal = await ownHire(app, binding, input.userId, input.hireId);
    if (!sameJournal(journal(field(beforeFinal.row, beforeFinal.ids[V2.pendingSubmission])), nextJournal) ||
      serialized(beforeFinal.hire.scores) !== previousScores ||
      field(beforeFinal.row, beforeFinal.ids[V2.lastSubmission]) !== lastOperation) throw new Error('WRITE_CONFLICT');
    const scores = appendScore(beforeFinal.hire.scores, day.order, score);
    const doneDays = completedDays(roadmap, scores);
    await patchFields(app, binding.hiresListId, input.hireId, {
      [context.ids[V2.scores]]: serialized(scores), [context.ids[V2.doneDays]]: doneDays,
      [context.ids[V2.lastSubmission]]: input.operationId, [context.ids[V2.pendingSubmission]]: '',
    });
    const saved = await ownHire(app, binding, input.userId, input.hireId);
    const savedAttempts = saved.hire.scores[String(day.order)]?.attempts ?? [];
    if (field(saved.row, saved.ids[V2.lastSubmission]) !== input.operationId ||
      field(saved.row, saved.ids[V2.pendingSubmission]) !== '' || saved.hire.doneDays !== doneDays ||
      serialized(saved.hire.scores) !== projectedScores || savedAttempts[savedAttempts.length - 1] !== score) throw new Error('WRITE_CONFLICT');
    await finishHireIfDone(app, input.hireId, saved.hire, saved.info.stages);
    const hire = (await ownHire(app, binding, input.userId, input.hireId)).hire;
    return { hire, grade, attempt: hire.scores[String(day.order)]?.attempts?.length ?? 1 };
  });
}
