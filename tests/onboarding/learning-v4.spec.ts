import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { V2, V2_HIRE_FIELDS, V2_ROADMAP_FIELDS } from '../../src/ui/onboarding/domain/v2-fields';
import { createMcpLearningCompat } from '../../src/ui/onboarding/data/privos/compat-flows';
import type { RoomBinding } from '../../src/ui/onboarding/domain/models';
import type { SubmitQuizInput } from '../../src/ui/onboarding/ports/learning';

const learningScopes = new WeakMap<McpApp, ReturnType<typeof createMcpLearningCompat>>();
function scope(app: McpApp, binding: RoomBinding, userId: string) {
  const existing = learningScopes.get(app);
  if (existing) return existing;
  const service = createMcpLearningCompat(app, binding, userId);
  learningScopes.set(app, service);
  return service;
}
const loadMyRoadmap = (app: McpApp, binding: RoomBinding, userId: string) => scope(app, binding, userId).load();
const markLessonRead = (app: McpApp, binding: RoomBinding, userId: string, hireId: string, lessonId: string) =>
  scope(app, binding, userId).markRead(hireId, lessonId);
const submitQuiz = (app: McpApp, binding: RoomBinding, input: SubmitQuizInput) =>
  scope(app, binding, input.userId).submit(input);

type Field = { fieldId: string; value: unknown };
type Row = { _id: string; listId: string; name: string; stageId: string; parentId: string | null; customFields: Field[] };
type Call = { name: string; arguments: Record<string, unknown> };

function fixture(options: { hijackJournalAfterWrite?: boolean; concurrentScoreAfterLessonRead?: boolean;
  alterFirstScoreAfterFinalWrite?: boolean; paginateLearning?: 'valid' | 'duplicate-item' | 'repeat-cursor';
  failAfterJournalWrite?: boolean; failDuringQuestionWrite?: boolean; concurrentScoreBeforeFinalWrite?: boolean } = {}) {
  const hireDefs = V2_HIRE_FIELDS.map((spec) => ({ _id: spec.name, name: spec.name, type: spec.type }));
  const runDefs = V2_ROADMAP_FIELDS.map((spec) => ({ _id: spec.name, name: spec.name, type: spec.type,
    ...(spec.options ? { options: spec.options.map((value) => ({ _id: value, value })) } : {}) }));
  const fields = (values: Record<string, unknown>) => Object.entries(values).map(([fieldId, value]) => ({ fieldId, value }));
  const hire: Row = { _id: 'hire-1', listId: 'hires-1', name: 'B', stageId: 'learning', parentId: null, customFields: fields({
    [V2.employee]: 'user-1', [V2.position]: 'position-1', [V2.positionName]: 'Kỹ sư', [V2.startDate]: '2026-09-24',
    [V2.roadmap]: 'run-1', [V2.doneDays]: 0, [V2.totalDays]: 1, [V2.scores]: '{}', [V2.errorCode]: '',
    [V2.pendingSubmission]: '', [V2.lastSubmission]: '', [V2.pendingAction]: '',
  }) };
  const hires = [hire];
  const addHire = (input: { id: string; employeeId: string; startDate: string; status: 'learning' | 'done';
    positionName?: string; roadmapListId?: string }): Row => {
    const row: Row = { ...hire, _id: input.id, name: input.id, stageId: input.status,
      customFields: hire.customFields.map((entry) => ({ ...entry })) };
    const values: Record<string, unknown> = {
      [V2.employee]: input.employeeId,
      [V2.startDate]: input.startDate,
      [V2.positionName]: input.positionName ?? 'Ká»¹ sÆ°',
      [V2.roadmap]: input.roadmapListId ?? 'run-1',
    };
    for (const [fieldId, value] of Object.entries(values)) {
      row.customFields.find((entry) => entry.fieldId === fieldId)!.value = value;
    }
    hires.push(row);
    return row;
  };
  const run: Row[] = [
    { _id: 'overview', listId: 'run-1', name: 'Tổng quan', stageId: 'content', parentId: null,
      customFields: fields({ [V2.source]: '__overview__', [V2.template]: 'template-1', [V2.parent]: '' }) },
    { _id: 'week-1', listId: 'run-1', name: 'Tuần 1', stageId: 'content', parentId: null,
      customFields: fields({ [V2.kind]: 'Tuần', [V2.order]: 0, [V2.parent]: 'overview' }) },
    { _id: 'day-1', listId: 'run-1', name: 'Ngày 1', stageId: 'content', parentId: null,
      customFields: fields({ [V2.kind]: 'Ngày', [V2.order]: 1, [V2.content]: 'Mục tiêu', [V2.parent]: 'week-1' }) },
    { _id: 'lesson-1', listId: 'run-1', name: 'Bài đọc', stageId: 'content', parentId: null,
      customFields: fields({ [V2.kind]: 'Bài học', [V2.order]: 0, [V2.content]: 'Đọc', [V2.read]: false, [V2.parent]: 'day-1',
        [V2.attachments]: [], [V2.videos]: '' }) },
    { _id: 'q-1', listId: 'run-1', name: 'Câu hỏi', stageId: 'content', parentId: null,
      customFields: fields({ [V2.kind]: 'Câu hỏi', [V2.order]: 0, [V2.content]: 'Chọn', [V2.options]: 'A\nB', [V2.parent]: 'day-1',
        [V2.answers]: 'b', [V2.multiple]: false, [V2.explanation]: 'Vì B đúng', [V2.selected]: '' }) },
  ];
  const calls: Call[] = [];
  let journalHijacked = false;
  let lessonScoreInjected = false;
  let finalHireReadbacks = 0;
  let finalHireWritten = false;
  let failedAfterJournal = false;
  let failedDuringQuestion = false;
  let concurrentScoreInjected = false;
  const app = { callServerTool: async (call: Call) => {
    calls.push(call);
    const args = call.arguments;
    if (call.name === 'mcpapp.lists.get') {
      const isHire = args.listId === 'hires-1';
      const pending = hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission);
      if (!isHire && options.failAfterJournalWrite && !failedAfterJournal && typeof pending?.value === 'string' && pending.value) {
        failedAfterJournal = true;
        throw new Error('SIMULATED_CRASH');
      }
      if (!isHire && options.hijackJournalAfterWrite && !journalHijacked && typeof pending?.value === 'string' && pending.value) {
        pending.value = JSON.stringify({ version: 1, operationId: 'other-attempt-123', dayId: 'day-1', previousScores: '{}', answers: { 'q-1': ['a'] } });
        journalHijacked = true;
      }
      if (!isHire && options.concurrentScoreAfterLessonRead && !lessonScoreInjected &&
        run.find((row) => row._id === 'lesson-1')?.customFields.find((entry) => entry.fieldId === V2.read)?.value === true) {
        hire.customFields.find((entry) => entry.fieldId === V2.scores)!.value = '{"1":{"first":"1/1","attempts":["1/1"]}}';
        hire.customFields.find((entry) => entry.fieldId === V2.doneDays)!.value = 1;
        lessonScoreInjected = true;
      }
      return { list: { _id: args.listId, name: isHire ? 'Onboarding hires' : 'Run', roomId: 'room-1', isolatedList: true,
        fieldDefinitions: isHire ? hireDefs : runDefs }, stages: isHire
        ? [{ _id: 'learning', name: 'Đang học', order: 0 }, { _id: 'done', name: 'Hoàn tất', order: 1 }]
        : [{ _id: 'content', name: 'Nội dung', order: 0 }] };
    }
    if (call.name === 'mcpapp.lists.queryItems') {
      const rows = args.listId === 'hires-1' ? hires : run;
      const filter = args.filter as { stageId?: string; customFields?: { fieldId: string; value: string }[] };
      const selected = rows.filter((row) => (!filter.stageId || row.stageId === filter.stageId) &&
        (filter.customFields ?? []).every((condition) => row.customFields.some((entry) => entry.fieldId === condition.fieldId && entry.value === condition.value)));
      if (args.listId === 'hires-1' && filter.stageId === 'learning' && options.paginateLearning) {
        if (!args.cursor) return { items: selected.slice(0, 1), nextCursor: 'cursor-2' };
        if (options.paginateLearning === 'duplicate-item') return { items: selected.slice(0, 1), nextCursor: null };
        return { items: selected.slice(1), nextCursor: options.paginateLearning === 'repeat-cursor' ? 'cursor-2' : null };
      }
      return { items: selected, nextCursor: null };
    }
    if (call.name === 'mcpapp.lists.getItem') {
      const pending = hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission)?.value;
      const selected = run.find((row) => row._id === 'q-1')?.customFields.find((entry) => entry.fieldId === V2.selected)?.value;
      if (args.itemId === hire._id && options.concurrentScoreBeforeFinalWrite && !concurrentScoreInjected &&
        typeof pending === 'string' && pending && selected === 'b') {
        hire.customFields.find((entry) => entry.fieldId === V2.scores)!.value = '{"2":{"first":"1/1","attempts":["1/1"]}}';
        concurrentScoreInjected = true;
      }
      if (args.itemId === hire._id && finalHireWritten && options.alterFirstScoreAfterFinalWrite) {
        finalHireReadbacks += 1;
        if (finalHireReadbacks === 2) {
          hire.customFields.find((entry) => entry.fieldId === V2.scores)!.value = '{"1":{"first":"0/1","attempts":["1/1"]}}';
        }
      }
      return { item: [...hires, ...run].find((row) => row._id === args.itemId) };
    }
    if (call.name === 'mcpapp.lists.updateItem') {
      const row = [...hires, ...run].find((entry) => entry._id === args.itemId);
      if (!row) throw new Error('missing row');
      row.customFields = args.customFields as Field[];
      if (row._id === 'q-1' && options.failDuringQuestionWrite && !failedDuringQuestion) {
        failedDuringQuestion = true;
        throw new Error('SIMULATED_CRASH');
      }
      if (row === hire && row.customFields.some((entry) => entry.fieldId === V2.lastSubmission && entry.value === 'attempt-12345678')) {
        finalHireWritten = true;
      }
      return { success: true };
    }
    if (call.name === 'mcpapp.lists.moveItemToStage') {
      const row = hires.find((entry) => entry._id === args.itemId);
      if (!row) throw new Error('missing hire');
      row.stageId = String(args.stageId);
      return { success: true };
    }
    throw new Error(`Unexpected ${call.name}`);
  } } as McpApp;
  return { app, calls, hire, hires, run, addHire,
    setFailAfterJournalWrite: (value: boolean) => { options.failAfterJournalWrite = value; },
    setFailDuringQuestionWrite: (value: boolean) => { options.failDuringQuestionWrite = value; } };
}

const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };

describe('P5 learning flow', () => {
  it('listMine returns only learning and done hires assigned to actor', async () => {
    const { app, calls, addHire } = fixture();
    addHire({ id: 'hire-2', employeeId: 'user-1', startDate: '2026-09-26', status: 'done', positionName: 'QA' });
    addHire({ id: 'hire-other', employeeId: 'user-2', startDate: '2026-09-27', status: 'learning' });

    await expect(scope(app, binding, 'user-1').listMine()).resolves.toEqual([
      { hireId: 'hire-2', positionName: 'QA', startDate: '2026-09-26', status: 'done', doneDays: 0, totalDays: 1 },
      { hireId: 'hire-1', positionName: 'Kỹ sư', startDate: '2026-09-24', status: 'learning', doneDays: 0, totalDays: 1 },
    ]);
    const queries = calls.filter((call) => call.name === 'mcpapp.lists.queryItems' && call.arguments.listId === 'hires-1');
    expect(queries).toHaveLength(2);
    expect(queries.every((call) => {
      const filter = call.arguments.filter as { archived?: boolean; customFields?: { fieldId: string; op: string; value: string }[] };
      return filter.archived === false && filter.customFields?.some((entry) =>
        entry.fieldId === V2.employee && entry.op === 'is' && entry.value === 'user-1');
    })).toBe(true);
  });

  it('load defaults to newest assigned hire', async () => {
    const { app, addHire } = fixture();
    addHire({ id: 'hire-2', employeeId: 'user-1', startDate: '2026-09-26', status: 'done', positionName: 'QA' });
    await expect(scope(app, binding, 'user-1').load()).resolves.toMatchObject({ hire: { id: 'hire-2' } });
  });

  it('load rejects another member hire id before reading its run', async () => {
    const { app, calls, addHire } = fixture();
    addHire({ id: 'hire-other', employeeId: 'user-2', startDate: '2026-09-27', status: 'learning', roadmapListId: 'run-other' });

    await expect(scope(app, binding, 'user-1').load('hire-other')).rejects.toThrow('HIRE_NOT_OWNED');
    expect(calls.some((call) => call.name === 'mcpapp.lists.get' && call.arguments.listId === 'run-other')).toBe(false);
  });

  it('member catalog follows every cursor without duplicates', async () => {
    const valid = fixture({ paginateLearning: 'valid' });
    valid.addHire({ id: 'hire-2', employeeId: 'user-1', startDate: '2026-09-25', status: 'learning' });
    await expect(scope(valid.app, binding, 'user-1').listMine()).resolves.toHaveLength(2);

    const duplicate = fixture({ paginateLearning: 'duplicate-item' });
    await expect(scope(duplicate.app, binding, 'user-1').listMine()).rejects.toThrow('PAGINATION_INVALID');

    const repeated = fixture({ paginateLearning: 'repeat-cursor' });
    repeated.addHire({ id: 'hire-2', employeeId: 'user-1', startDate: '2026-09-25', status: 'learning' });
    await expect(scope(repeated.app, binding, 'user-1').listMine()).rejects.toThrow('PAGINATION_INVALID');
  });

  it('queries only the signed-in assignee and decodes week items from the run', async () => {
    const { app, calls } = fixture();
    const loaded = await loadMyRoadmap(app, binding, 'user-1');
    expect(loaded?.hire.positionName).toBe('Kỹ sư');
    expect(loaded?.roadmap.tree.weeks).toEqual([{ id: 'week-1', name: 'Tuần 1', order: 0 }]);
    expect(loaded?.roadmap.tree.items.map((item) => item.kind)).toEqual(['day', 'lesson', 'question']);
    expect(loaded?.roadmap.tree.items.find((item) => item.id === 'day-1')).toMatchObject({ stageId: 'week-1', parentId: null });
    expect(loaded?.roadmap.tree.items.find((item) => item.id === 'lesson-1')).toMatchObject({ stageId: 'week-1', parentId: 'day-1' });
    const queries = calls.filter((call) => call.name === 'mcpapp.lists.queryItems' && call.arguments.listId === 'hires-1');
    expect(queries).toHaveLength(2);
    expect(queries.every((call) => JSON.stringify(call.arguments.filter).includes('user-1'))).toBe(true);
  });

  it('loads a legacy run whose overview was incorrectly encoded as a week', async () => {
    const { app, run } = fixture();
    const overview = run.find((row) => row._id === 'overview')!;
    overview.customFields.push({ fieldId: V2.kind, value: 'Tuần' }, { fieldId: V2.order, value: 0 });

    const loaded = await loadMyRoadmap(app, binding, 'user-1');

    expect(loaded?.roadmap.overviewId).toBe('overview');
    expect(loaded?.roadmap.tree.weeks).toEqual([{ id: 'week-1', name: 'Tuần 1', order: 0 }]);
    expect(loaded?.roadmap.tree.items.some((item) => item.id === 'overview')).toBe(false);
  });

  it('rejects a run whose logical parent field points to another level', async () => {
    const { app, run } = fixture();
    run.find((row) => row._id === 'lesson-1')!.customFields.find((entry) => entry.fieldId === V2.parent)!.value = 'week-1';
    await expect(loadMyRoadmap(app, binding, 'user-1')).rejects.toThrow('RUN_INVALID');
  });

  it('rejects a run whose logical parent field is missing', async () => {
    const { app, run } = fixture();
    const day = run.find((row) => row._id === 'day-1')!;
    day.customFields = day.customFields.filter((entry) => entry.fieldId !== V2.parent);
    await expect(loadMyRoadmap(app, binding, 'user-1')).rejects.toThrow('RUN_INVALID');
  });

  it('marks a lesson read but keeps quiz day incomplete', async () => {
    const { app, run } = fixture();
    const result = await markLessonRead(app, binding, 'user-1', 'hire-1', 'lesson-1');
    expect(result.hire.doneDays).toBe(0);
    expect(result.roadmap.tree.items.find((item) => item.id === 'lesson-1')).toMatchObject({ read: true });
    expect(run.find((row) => row._id === 'lesson-1')?.customFields.find((field) => field.fieldId === V2.read)?.value).toBe(true);
  });

  it('persists a quiz attempt and does not append it twice on retry', async () => {
    const { app, calls } = fixture();
    const input = { userId: 'user-1', hireId: 'hire-1', dayId: 'day-1', operationId: 'attempt-12345678', answers: { 'q-1': ['b'] } };
    const first = await submitQuiz(app, binding, input);
    const retried = await submitQuiz(app, binding, input);
    expect(first.grade).toMatchObject({ score: 1, total: 1 });
    expect(first.hire.scores['1']).toEqual({ first: '1/1', attempts: ['1/1'] });
    expect(retried.hire.scores['1']).toEqual({ first: '1/1', attempts: ['1/1'] });
    expect(calls.filter((call) => call.name === 'mcpapp.lists.moveItemToStage')).toHaveLength(1);
  });

  it('exposes a pending submission after reload', async () => {
    const env = fixture({ failAfterJournalWrite: true });
    const service = scope(env.app, binding, 'user-1');
    await expect(service.submit({ hireId: 'hire-1', dayId: 'day-1', operationId: 'attempt-12345678',
      answers: { 'q-1': ['b'] } })).rejects.toThrow('SIMULATED_CRASH');
    env.setFailAfterJournalWrite(false);

    const loaded = await service.load();
    expect(loaded?.pendingSubmission).toEqual({ dayId: 'day-1', operationId: 'attempt-12345678', answeredQuestions: 1 });
    expect(loaded?.pendingSubmission).not.toHaveProperty('answers');
  });

  it('resume continues the stored operation without a second attempt', async () => {
    const env = fixture({ failDuringQuestionWrite: true });
    const service = scope(env.app, binding, 'user-1');
    await expect(service.submit({ hireId: 'hire-1', dayId: 'day-1', operationId: 'attempt-12345678',
      answers: { 'q-1': ['b'] } })).rejects.toThrow('SIMULATED_CRASH');
    env.setFailDuringQuestionWrite(false);

    const resumed = await service.resume('hire-1');
    expect(resumed.hire.scores['1']).toEqual({ first: '1/1', attempts: ['1/1'] });
    expect(resumed.attempt).toBe(1);
    expect(env.hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission)?.value).toBe('');
  });

  it('load reconciles final score written before stage move', async () => {
    const env = fixture();
    env.hire.customFields.find((entry) => entry.fieldId === V2.doneDays)!.value = 1;
    env.hire.customFields.find((entry) => entry.fieldId === V2.scores)!.value = '{"1":{"first":"1/1","attempts":["1/1"]}}';

    const loaded = await scope(env.app, binding, 'user-1').load();

    expect(loaded?.hire.status).toBe('done');
    expect(loaded?.hire.scores['1']?.attempts).toEqual(['1/1']);
    expect(env.calls.filter((call) => call.name === 'mcpapp.lists.updateItem')).toHaveLength(0);
    expect(env.calls.filter((call) => call.name === 'mcpapp.lists.moveItemToStage')).toHaveLength(1);
  });

  it('resume rejects a changed journal or changed previous scores', async () => {
    const journal = JSON.stringify({ version: 1, operationId: 'attempt-12345678', dayId: 'day-1',
      previousScores: '{}', answers: { 'q-1': ['b'] } });
    const changedJournal = fixture({ hijackJournalAfterWrite: true });
    changedJournal.hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission)!.value = journal;
    await expect(scope(changedJournal.app, binding, 'user-1').resume('hire-1')).rejects.toThrow('WRITE_CONFLICT');

    const changedScores = fixture();
    changedScores.hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission)!.value = journal;
    const newerScores = '{"2":{"first":"1/1","attempts":["1/1"]}}';
    changedScores.hire.customFields.find((entry) => entry.fieldId === V2.scores)!.value = newerScores;
    await expect(scope(changedScores.app, binding, 'user-1').resume('hire-1')).rejects.toThrow('WRITE_CONFLICT');
    expect(changedScores.hire.customFields.find((entry) => entry.fieldId === V2.scores)?.value).toBe(newerScores);
  });

  it('two tabs on different days never overwrite a newer scores object', async () => {
    const env = fixture({ concurrentScoreBeforeFinalWrite: true });
    await expect(scope(env.app, binding, 'user-1').submit({ hireId: 'hire-1', dayId: 'day-1',
      operationId: 'attempt-12345678', answers: { 'q-1': ['b'] } })).rejects.toThrow('WRITE_CONFLICT');
    expect(env.hire.customFields.find((entry) => entry.fieldId === V2.scores)?.value)
      .toBe('{"2":{"first":"1/1","attempts":["1/1"]}}');
  });

  it('rejects reuse of an operation id with changed answers', async () => {
    const { app } = fixture();
    const base = { userId: 'user-1', hireId: 'hire-1', dayId: 'day-1', operationId: 'attempt-12345678' };
    await submitQuiz(app, binding, { ...base, answers: { 'q-1': ['b'] } });
    await expect(submitQuiz(app, binding, { ...base, answers: { 'q-1': ['a'] } })).rejects.toThrow('WRITE_CONFLICT');
  });

  it('stops before question writes if another tab replaces the journal', async () => {
    const { app, run } = fixture({ hijackJournalAfterWrite: true });
    await expect(submitQuiz(app, binding, { userId: 'user-1', hireId: 'hire-1', dayId: 'day-1',
      operationId: 'attempt-12345678', answers: { 'q-1': ['b'] } })).rejects.toThrow('WRITE_CONFLICT');
    expect(run.find((row) => row._id === 'q-1')?.customFields.find((entry) => entry.fieldId === V2.selected)?.value).toBe('');
  });

  it('preserves a concurrently recorded quiz score when a lesson-only day finishes', async () => {
    const { app, hire, run } = fixture({ concurrentScoreAfterLessonRead: true });
    run.splice(run.findIndex((row) => row._id === 'q-1'), 1);
    const result = await markLessonRead(app, binding, 'user-1', 'hire-1', 'lesson-1');
    expect(result.hire.scores['1']).toEqual({ first: '1/1', attempts: ['1/1'] });
    expect(hire.customFields.find((entry) => entry.fieldId === V2.scores)?.value).toBe('{"1":{"first":"1/1","attempts":["1/1"]}}');
  });

  it('rejects a final readback whose first score changed even when last attempt matches', async () => {
    const { app } = fixture({ alterFirstScoreAfterFinalWrite: true });
    await expect(submitQuiz(app, binding, { userId: 'user-1', hireId: 'hire-1', dayId: 'day-1',
      operationId: 'attempt-12345678', answers: { 'q-1': ['b'] } })).rejects.toThrow('WRITE_CONFLICT');
  });

  it('does not write answers or scores while cancellation is pending', async () => {
    const { app, hire, run, calls } = fixture();
    hire.customFields.find((entry) => entry.fieldId === V2.pendingAction)!.value = 'cancel';
    await expect(submitQuiz(app, binding, { userId: 'user-1', hireId: 'hire-1', dayId: 'day-1',
      operationId: 'attempt-12345678', answers: { 'q-1': ['b'] } })).rejects.toThrow('HIRE_CANCELLING');
    expect(calls.some((call) => call.name === 'mcpapp.lists.updateItem')).toBe(false);
    expect(run.find((row) => row._id === 'q-1')?.customFields.find((entry) => entry.fieldId === V2.selected)?.value).toBe('');
  });
});

describe('invalid run mutation barrier', () => {
  it.each([
    ['day-1', V2.order, 1.5],
    ['lesson-1', V2.order, 0.5],
    ['q-1', V2.options, 42],
  ] as const)('load rejects malformed %s field %s without writes', async (id, fieldId, value) => {
    const env = fixture();
    env.run.find((row) => row._id === id)!.customFields.find((entry) => entry.fieldId === fieldId)!.value = value;
    env.hire.customFields.find((entry) => entry.fieldId === V2.doneDays)!.value = 1;
    await expect(scope(env.app, binding, 'user-1').load()).rejects.toThrow('RUN_INVALID');
    expect(env.calls.filter((call) => ['mcpapp.lists.updateItem', 'mcpapp.lists.moveItemToStage'].includes(call.name))).toEqual([]);
  });
  it.each(['load', 'markRead', 'submit', 'resume', 'load-completed'] as const)('%s rejects duplicate day order without writes', async (action) => {
    const env = fixture();
    const clone = (id: string, source: Row): Row => ({ ...source, _id: id, customFields: source.customFields.map((entry) => ({ ...entry })) });
    env.run.push(clone('week-2', env.run[1]));
    const day = clone('day-2', env.run[2]);
    day.customFields.find((entry) => entry.fieldId === V2.parent)!.value = 'week-2'; env.run.push(day);
    if (action === 'load-completed') env.hire.customFields.find((entry) => entry.fieldId === V2.doneDays)!.value = 1;
    if (action === 'resume') env.hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission)!.value = JSON.stringify({
      version: 1, operationId: 'attempt-12345678', dayId: 'day-1', previousScores: '{}', answers: { 'q-1': ['b'] },
    });
    const service = scope(env.app, binding, 'user-1');
    const operation = action === 'markRead' ? service.markRead('hire-1', 'lesson-1')
      : action === 'submit' ? service.submit({ hireId: 'hire-1', dayId: 'day-1', operationId: 'attempt-12345678', answers: { 'q-1': ['b'] } })
      : action === 'resume' ? service.resume('hire-1') : service.load();
    await expect(operation).rejects.toThrow('RUN_INVALID');
    expect(env.calls.filter((call) => ['mcpapp.lists.updateItem', 'mcpapp.lists.moveItemToStage'].includes(call.name))).toEqual([]);
  });
});
