import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { V2, V2_HIRE_FIELDS, V2_ROADMAP_FIELDS } from '../../src/ui/onboarding/domain/v2-fields';
import { loadMyRoadmap, markLessonRead, submitQuiz } from '../../src/ui/onboarding/flows/learning-v4';

type Field = { fieldId: string; value: unknown };
type Row = { _id: string; listId: string; name: string; stageId: string; parentId: string | null; customFields: Field[] };
type Call = { name: string; arguments: Record<string, unknown> };

function fixture(options: { hijackJournalAfterWrite?: boolean; concurrentScoreAfterLessonRead?: boolean;
  alterFirstScoreAfterFinalWrite?: boolean } = {}) {
  const hireDefs = V2_HIRE_FIELDS.map((spec) => ({ _id: spec.name, name: spec.name, type: spec.type }));
  const runDefs = V2_ROADMAP_FIELDS.map((spec) => ({ _id: spec.name, name: spec.name, type: spec.type,
    ...(spec.options ? { options: spec.options.map((value) => ({ _id: value, value })) } : {}) }));
  const fields = (values: Record<string, unknown>) => Object.entries(values).map(([fieldId, value]) => ({ fieldId, value }));
  const hire: Row = { _id: 'hire-1', listId: 'hires-1', name: 'B', stageId: 'learning', parentId: null, customFields: fields({
    [V2.employee]: 'user-1', [V2.position]: 'position-1', [V2.positionName]: 'Kỹ sư', [V2.startDate]: '2026-09-24',
    [V2.roadmap]: 'run-1', [V2.doneDays]: 0, [V2.totalDays]: 1, [V2.scores]: '{}', [V2.errorCode]: '',
    [V2.pendingSubmission]: '', [V2.lastSubmission]: '', [V2.pendingAction]: '',
  }) };
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
  const app = { callServerTool: async (call: Call) => {
    calls.push(call);
    const args = call.arguments;
    if (call.name === 'mcpapp.lists.get') {
      const isHire = args.listId === 'hires-1';
      const pending = hire.customFields.find((entry) => entry.fieldId === V2.pendingSubmission);
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
      const rows = args.listId === 'hires-1' ? [hire] : run;
      const filter = args.filter as { stageId?: string; customFields?: { fieldId: string; value: string }[] };
      return { items: rows.filter((row) => (!filter.stageId || row.stageId === filter.stageId) &&
        (filter.customFields ?? []).every((condition) => row.customFields.some((entry) => entry.fieldId === condition.fieldId && entry.value === condition.value))), nextCursor: null };
    }
    if (call.name === 'mcpapp.lists.getItem') {
      if (args.itemId === hire._id && finalHireWritten && options.alterFirstScoreAfterFinalWrite) {
        finalHireReadbacks += 1;
        if (finalHireReadbacks === 2) {
          hire.customFields.find((entry) => entry.fieldId === V2.scores)!.value = '{"1":{"first":"0/1","attempts":["1/1"]}}';
        }
      }
      return { item: [hire, ...run].find((row) => row._id === args.itemId) };
    }
    if (call.name === 'mcpapp.lists.updateItem') {
      const row = [hire, ...run].find((entry) => entry._id === args.itemId);
      if (!row) throw new Error('missing row');
      row.customFields = args.customFields as Field[];
      if (row === hire && row.customFields.some((entry) => entry.fieldId === V2.lastSubmission && entry.value === 'attempt-12345678')) {
        finalHireWritten = true;
      }
      return { success: true };
    }
    if (call.name === 'mcpapp.lists.moveItemToStage') { hire.stageId = String(args.stageId); return { success: true }; }
    throw new Error(`Unexpected ${call.name}`);
  } } as McpApp;
  return { app, calls, hire, run };
}

const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };

describe('P5 learning flow', () => {
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
