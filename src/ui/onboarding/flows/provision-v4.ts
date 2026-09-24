import type { McpApp } from '@privos_ai/app-react';
import { createIsolatedListViaTool, getIsolatedListViaTool } from '../data/isolated-lists';
import { createCatalogs, type Catalogs } from '../data/catalogs';
import { createItem, listRoomLists } from '../data/onboarding-lists';
import { patchFields, queryItems, readAllItems, readItem, readListInfo } from '../data/v2-lists';
import { unwrapToolResult } from '../data/tool-result';
import { OnboardingError } from '../domain/errors';
import type { ContentItem, Position, RoomBinding, TemplateTree, Week } from '../domain/models';
import { isRoomAdmin } from '../domain/roles';
import { validateReady } from '../domain/template-readiness';
import { V2, V2_HIRE_FIELDS, V2_POSITION_FIELDS, V2_ROADMAP_FIELDS, resolveV2FieldIds } from '../domain/v2-fields';
import { isValidIsoDate } from '../domain/working-days';

const CONTENT_STAGE = 'Nội dung';
const PROVISIONING_STAGE = 'Đang khởi tạo';
const FAILED_STAGE = 'Khởi tạo lỗi';
const LEARNING_STAGE = 'Đang học';
const OVERVIEW_SOURCE = '__overview__';

export interface PreparedProvisionV4 {
  input: { positionId: string; employeeId: string; employeeName: string; startDate: string; operationId: string };
  position: Position;
  tree: TemplateTree;
  fingerprint: string;
}

export type ProvisionPhase = 'record' | 'list' | 'content' | 'grant' | 'activate' | 'recount';
export interface ProvisionProgress { phase: ProvisionPhase; completed: number; total: number }
export type ProvisionOutcome = { state: 'active' | 'active-needs-recount'; hireId: string; roadmapListId: string };
export interface PlannedRunNode { sourceId: string; parentSourceId: string; node: Week | ContentItem }

interface Checkpoint {
  version: 1; operationId: string; templateFingerprint: string; runKey: string;
  employeeId: string; positionId: string; startDate: string;
}

function fail(code: string): never { throw new Error(code); }
function field(item: { customFields?: { fieldId: string; value: unknown }[] }, id: string): unknown {
  return item.customFields?.find((entry) => entry.fieldId === id)?.value;
}
function sorted<T extends { id: string; order: number }>(nodes: readonly T[]): T[] {
  return [...nodes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function planRunNodes(tree: TemplateTree): PlannedRunNode[] {
  const weeks = sorted(tree.weeks).map((node) => ({ sourceId: node.id, parentSourceId: OVERVIEW_SOURCE, node }));
  const days = sorted(tree.items.filter((item) => item.kind === 'day'))
    .map((node) => ({ sourceId: node.id, parentSourceId: node.stageId, node }));
  const children = days.flatMap((day) => sorted(tree.items.filter((item) => item.kind !== 'day' && item.parentId === day.sourceId))
    .map((node) => ({ sourceId: node.id, parentSourceId: node.parentId ?? fail('TEMPLATE_INVALID'), node })));
  return [...weeks, ...days, ...children];
}

export async function templateFingerprint(tree: TemplateTree): Promise<string> {
  const canonical = {
    weeks: sorted(tree.weeks).map(({ id, name, order }) => ({ id, name, order })),
    items: [...tree.items].sort((a, b) => a.id.localeCompare(b.id)).map((item) => {
      const base = { id: item.id, name: item.name, kind: item.kind, stageId: item.stageId,
        parentId: item.parentId, order: item.order, content: item.content };
      switch (item.kind) {
        case 'day': return base;
        case 'lesson': return { ...base, attachments: item.attachments.map(({ id }) => id), videos: item.videos };
        case 'question': return { ...base, options: item.options, correctLabels: item.correctLabels, explanation: item.explanation };
      }
    }),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function checkpoint(raw: unknown): Checkpoint {
  let parsed: unknown;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : null; }
  catch { throw new OnboardingError('SCHEMA_DRIFT'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new OnboardingError('SCHEMA_DRIFT');
  const data = parsed as Record<string, unknown>;
  if (data.version !== 1 || !['operationId', 'templateFingerprint', 'runKey', 'employeeId', 'positionId', 'startDate']
    .every((key) => typeof data[key] === 'string' && data[key] !== '')) throw new OnboardingError('SCHEMA_DRIFT');
  return data as unknown as Checkpoint;
}

function encodedNode(node: Week | ContentItem, sourceId: string, ids: Record<string, string>, definitions: readonly { _id: string; name: string; type: string; options?: { _id?: string; value: string }[] }[]): { fieldId: string; value: unknown }[] {
  const label = 'kind' in node ? { day: 'Ngày', lesson: 'Bài học', question: 'Câu hỏi' }[node.kind] : 'Tuần';
  const kind = definitions.find((definition) => definition._id === ids[V2.kind])?.options?.find((option) => option.value === label)?._id;
  if (!kind) throw new OnboardingError('SCHEMA_DRIFT');
  const values: { fieldId: string; value: unknown }[] = [
    { fieldId: ids[V2.kind], value: kind }, { fieldId: ids[V2.order], value: node.order },
    { fieldId: ids[V2.source], value: sourceId },
  ];
  if (!('kind' in node)) return values;
  values.push({ fieldId: ids[V2.content], value: node.content });
  if (node.kind === 'lesson') {
    values.push({ fieldId: ids[V2.attachments], value: node.attachments.map((attachment) => {
      if (!attachment.raw) throw new OnboardingError('SCHEMA_DRIFT');
      return attachment.raw;
    }) });
    values.push({ fieldId: ids[V2.videos], value: node.videos.join('\n') });
    values.push({ fieldId: ids[V2.read], value: false });
  }
  if (node.kind === 'question') {
    values.push({ fieldId: ids[V2.options], value: node.options.join('\n') });
    values.push({ fieldId: ids[V2.answers], value: node.correctLabels.join(',') });
    values.push({ fieldId: ids[V2.multiple], value: node.correctLabels.length > 1 });
    values.push({ fieldId: ids[V2.explanation], value: node.explanation });
    values.push({ fieldId: ids[V2.selected], value: '' });
  }
  return values;
}

async function checkPrepared(app: McpApp, binding: RoomBinding, prepared: PreparedProvisionV4,
  catalogs: Pick<Catalogs, 'position' | 'template' | 'hires'>): Promise<string | null> {
  const { input, position, tree } = prepared;
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(input.operationId) || !input.employeeId || !input.employeeName.trim() || !isValidIsoDate(input.startDate) ||
    position.id !== input.positionId || position.status !== 'ready' || !position.templateListId ||
    validateReady(tree, position.name).length || (await templateFingerprint(tree)) !== prepared.fingerprint) {
    throw new OnboardingError('TEMPLATE_INVALID');
  }
  const current = await catalogs.position(position.id);
  if (current.status !== 'ready' || current.templateListId !== position.templateListId) throw new OnboardingError('TEMPLATE_INVALID');
  if ((await templateFingerprint(await catalogs.template(position.templateListId))) !== prepared.fingerprint) fail('TEMPLATE_CHANGED');
  const hireInfo = await readListInfo(app, binding.hiresListId);
  if (hireInfo.list.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
  const hireIds = resolveV2FieldIds(hireInfo.list.fieldDefinitions, V2_HIRE_FIELDS);
  let matchingHireId: string | null = null;
  let cursor: string | undefined;
  do {
    const page = await catalogs.hires({ text: '' }, cursor);
    for (const hire of page.items) {
      if (hire.employeeId !== input.employeeId || !['provisioning', 'learning', 'failed'].includes(hire.status)) continue;
      const raw = await readItem(app, binding.hiresListId, hire.id);
      const previous = checkpoint(field(raw, hireIds[V2.provision]));
      if (previous.operationId !== input.operationId || previous.employeeId !== input.employeeId ||
        previous.positionId !== input.positionId || previous.startDate !== input.startDate ||
        previous.templateFingerprint !== prepared.fingerprint || matchingHireId !== null) throw new OnboardingError('HIRE_EXISTS');
      matchingHireId = hire.id;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return matchingHireId;
}

async function findRun(app: McpApp, roomId: string, runKey: string, operationId: string): Promise<string | null> {
  const matches = (await listRoomLists(app, roomId)).filter((list) => list.key === runKey);
  if (matches.length > 1) fail('RUN_KEY_CONFLICT');
  if (matches[0] && matches[0].name !== `Onboarding run · ${operationId}`) fail('RUN_KEY_CONFLICT');
  return matches[0]?._id ?? null;
}

export async function recountPositionV4(app: McpApp, binding: RoomBinding, positionId: string): Promise<number> {
  const [positionInfo, hireInfo] = await Promise.all([
    readListInfo(app, binding.positionsListId), readListInfo(app, binding.hiresListId),
  ]);
  if (positionInfo.list.roomId !== binding.roomId || hireInfo.list.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
  const positionIds = resolveV2FieldIds(positionInfo.list.fieldDefinitions, V2_POSITION_FIELDS);
  const hireIds = resolveV2FieldIds(hireInfo.list.fieldDefinitions, V2_HIRE_FIELDS);
  const learningStage = hireInfo.stages.find((stage) => stage.name === LEARNING_STAGE)?._id;
  if (!learningStage) throw new OnboardingError('SCHEMA_DRIFT');
  const seenItems = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await queryItems(app, binding.hiresListId, { stageId: learningStage,
      customFields: [{ fieldId: hireIds[V2.position], op: 'is', value: positionId }] }, 200, cursor);
    for (const item of page.items) {
      if (seenItems.has(item._id)) throw new OnboardingError('PAGINATION_INVALID');
      seenItems.add(item._id);
    }
    if (page.nextCursor && seenCursors.has(page.nextCursor)) throw new OnboardingError('PAGINATION_INVALID');
    if (page.nextCursor) seenCursors.add(page.nextCursor);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  await patchFields(app, binding.positionsListId, positionId, { [positionIds[V2.inUse]]: seenItems.size });
  return seenItems.size;
}

async function finishRecount(app: McpApp, binding: RoomBinding, positionId: string, hireId: string,
  runId: string, onProgress?: (progress: ProvisionProgress) => void): Promise<ProvisionOutcome> {
  try {
    await recountPositionV4(app, binding, positionId);
    onProgress?.({ phase: 'recount', completed: 1, total: 1 });
    return { state: 'active', hireId, roadmapListId: runId };
  } catch {
    onProgress?.({ phase: 'recount', completed: 0, total: 1 });
    return { state: 'active-needs-recount', hireId, roadmapListId: runId };
  }
}

async function continueProvision(app: McpApp, binding: RoomBinding, prepared: PreparedProvisionV4,
  hireId: string, state: Checkpoint, onProgress?: (progress: ProvisionProgress) => void): Promise<ProvisionOutcome> {
  const hireInfo = await readListInfo(app, binding.hiresListId);
  if (hireInfo.list.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
  const hireIds = resolveV2FieldIds(hireInfo.list.fieldDefinitions, V2_HIRE_FIELDS);
  const provisioningStage = hireInfo.stages.find((stage) => stage.name === PROVISIONING_STAGE)?._id;
  const failedStage = hireInfo.stages.find((stage) => stage.name === FAILED_STAGE)?._id;
  const learningStage = hireInfo.stages.find((stage) => stage.name === LEARNING_STAGE)?._id;
  if (!provisioningStage || !failedStage || !learningStage) throw new OnboardingError('SCHEMA_DRIFT');
  let hire = await readItem(app, binding.hiresListId, hireId);
  if (JSON.stringify(checkpoint(field(hire, hireIds[V2.provision]))) !== JSON.stringify(state)) throw new OnboardingError('SCHEMA_DRIFT');
  if (state.templateFingerprint !== prepared.fingerprint ||
    (hire.stageId !== provisioningStage && hire.stageId !== failedStage)) throw new OnboardingError('SCHEMA_DRIFT');

  const runId = String(field(hire, hireIds[V2.roadmap]) ?? '') || await findRun(app, binding.roomId, state.runKey, state.operationId) ||
    (await createIsolatedListViaTool(app, { roomId: binding.roomId, name: `Onboarding run · ${state.operationId}`,
      key: state.runKey, isolated: true, stages: [{ name: CONTENT_STAGE, order: 0, color: '#3084c0' }],
      fields: [...V2_ROADMAP_FIELDS] }))._id;
  const run = await getIsolatedListViaTool(app, runId);
  if (run.roomId !== binding.roomId || !run.isolatedList || run.name !== `Onboarding run · ${state.operationId}` ||
    run.stages.length !== 1 || run.stages[0].name !== CONTENT_STAGE) throw new OnboardingError('SCHEMA_DRIFT');
  const runIds = resolveV2FieldIds(run.fieldDefinitions, V2_ROADMAP_FIELDS);
  if (field(hire, hireIds[V2.roadmap]) !== runId) await patchFields(app, binding.hiresListId, hireId, { [hireIds[V2.roadmap]]: runId });
  onProgress?.({ phase: 'list', completed: 1, total: 1 });

  const existing = await readAllItems(app, runId);
  const bySource = new Map<string, typeof existing[number]>();
  for (const row of existing) {
    const source = field(row, runIds[V2.source]);
    if (typeof source !== 'string' || !source || bySource.has(source)) throw new OnboardingError('SCHEMA_DRIFT');
    bySource.set(source, row);
  }
  const mapped = new Map<string, string>();
  const stageId = run.stages[0]._id;
  const planned: PlannedRunNode[] = [{ sourceId: OVERVIEW_SOURCE, parentSourceId: '', node: { id: OVERVIEW_SOURCE,
    name: 'Tổng quan', order: 0 } }, ...planRunNodes(prepared.tree)];
  let completed = 0;
  for (const entry of planned) {
    const parentId = entry.parentSourceId ? mapped.get(entry.parentSourceId) : undefined;
    if (entry.parentSourceId && !parentId) throw new OnboardingError('SCHEMA_DRIFT');
    const expectedFields = encodedNode(entry.node, entry.sourceId, runIds, run.fieldDefinitions);
    expectedFields.push({ fieldId: runIds[V2.parent], value: parentId ?? '' });
    if (entry.sourceId === OVERVIEW_SOURCE) {
      expectedFields.push({ fieldId: runIds[V2.startDate], value: state.startDate },
        { fieldId: runIds[V2.template], value: prepared.position.templateListId });
    }
    let row = bySource.get(entry.sourceId);
    if (!row) {
      try {
        row = await createItem(app, { listId: runId, name: entry.node.name, stageId, customFields: expectedFields });
      } catch (error) {
        const found = (await readAllItems(app, runId)).filter((candidate) => field(candidate, runIds[V2.source]) === entry.sourceId);
        if (found.length !== 1) throw error;
        row = found[0];
      }
      bySource.set(entry.sourceId, row);
    }
    if (row.stageId !== stageId || row.name !== entry.node.name ||
      expectedFields.some(({ fieldId, value }) => JSON.stringify(field(row!, fieldId)) !== JSON.stringify(value))) throw new OnboardingError('SCHEMA_DRIFT');
    mapped.set(entry.sourceId, row._id);
    completed += 1;
    onProgress?.({ phase: 'content', completed, total: planned.length });
  }
  if (bySource.size !== planned.length) throw new OnboardingError('SCHEMA_DRIFT');

  const rows = await readAllItems(app, runId);
  if (rows.length !== planned.length) throw new OnboardingError('SCHEMA_DRIFT');
  const readbackById = new Map(rows.map((row) => [row._id, row]));
  if (readbackById.size !== planned.length) throw new OnboardingError('SCHEMA_DRIFT');
  for (const entry of planned) {
    const row = readbackById.get(mapped.get(entry.sourceId) ?? '');
    const parentId = entry.parentSourceId ? mapped.get(entry.parentSourceId) : undefined;
    if (!row || field(row, runIds[V2.source]) !== entry.sourceId ||
      field(row, runIds[V2.parent]) !== (parentId ?? '')) throw new OnboardingError('SCHEMA_DRIFT');
  }
  let granted = 0;
  for (const row of rows.filter((candidate) => field(candidate, runIds[V2.source]) !== OVERVIEW_SOURCE)) {
    await patchFields(app, runId, row._id, { [runIds[V2.assignee]]: state.employeeId });
    granted += 1;
    onProgress?.({ phase: 'grant', completed: granted, total: rows.length });
  }
  const overviewId = mapped.get(OVERVIEW_SOURCE);
  if (!overviewId) throw new OnboardingError('SCHEMA_DRIFT');
  await patchFields(app, runId, overviewId, { [runIds[V2.assignee]]: state.employeeId });
  onProgress?.({ phase: 'grant', completed: rows.length, total: rows.length });
  await patchFields(app, binding.hiresListId, hireId, { [hireIds[V2.employee]]: state.employeeId });
  unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: hireId, stageId: learningStage } }));
  hire = await readItem(app, binding.hiresListId, hireId);
  if (hire.stageId !== learningStage || field(hire, hireIds[V2.employee]) !== state.employeeId ||
    field(hire, hireIds[V2.roadmap]) !== runId) throw new OnboardingError('SCHEMA_DRIFT');
  onProgress?.({ phase: 'activate', completed: 1, total: 1 });
  return finishRecount(app, binding, state.positionId, hireId, runId, onProgress);
}

export async function provisionV4(app: McpApp, binding: RoomBinding, prepared: PreparedProvisionV4,
  actorRoles: readonly string[], onProgress?: (progress: ProvisionProgress) => void,
  catalogs: Pick<Catalogs, 'position' | 'template' | 'hires'> = createCatalogs(app, binding)): Promise<ProvisionOutcome> {
  if (!isRoomAdmin(actorRoles)) throw new OnboardingError('NOT_ADMIN');
  const existingHireId = await checkPrepared(app, binding, prepared, catalogs);
  if (existingHireId) return resumeV4(app, binding, existingHireId, prepared, actorRoles, onProgress, catalogs);
  const hireInfo = await readListInfo(app, binding.hiresListId);
  if (hireInfo.list.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
  const ids = resolveV2FieldIds(hireInfo.list.fieldDefinitions, V2_HIRE_FIELDS);
  const stageId = hireInfo.stages.find((stage) => stage.name === PROVISIONING_STAGE)?._id;
  if (!stageId) throw new OnboardingError('SCHEMA_DRIFT');
  const state: Checkpoint = { version: 1, operationId: prepared.input.operationId, templateFingerprint: prepared.fingerprint,
    runKey: `onb-run-${prepared.input.employeeId}-${prepared.input.startDate.replace(/-/g, '')}-${prepared.input.operationId}`,
    employeeId: prepared.input.employeeId, positionId: prepared.input.positionId, startDate: prepared.input.startDate };
  const serialized = JSON.stringify(state);
  if (new TextEncoder().encode(serialized).length > 8192) throw new OnboardingError('SCHEMA_DRIFT');
  const hire = await createItem(app, { listId: binding.hiresListId, name: prepared.input.employeeName, stageId,
    customFields: [
      { fieldId: ids[V2.position], value: prepared.input.positionId },
      { fieldId: ids[V2.positionName], value: prepared.position.name },
      { fieldId: ids[V2.startDate], value: prepared.input.startDate },
      { fieldId: ids[V2.roadmap], value: '' },
      { fieldId: ids[V2.doneDays], value: 0 }, { fieldId: ids[V2.totalDays], value: prepared.tree.items.filter((item) => item.kind === 'day').length },
      { fieldId: ids[V2.scores], value: '{}' }, { fieldId: ids[V2.errorCode], value: '' },
      { fieldId: ids[V2.provision], value: serialized },
      { fieldId: ids[V2.pendingSubmission], value: '' }, { fieldId: ids[V2.lastSubmission], value: '' },
      { fieldId: ids[V2.pendingAction], value: '' },
    ] });
  onProgress?.({ phase: 'record', completed: 1, total: 1 });
  return continueProvision(app, binding, prepared, hire._id, state, onProgress);
}

export async function resumeV4(app: McpApp, binding: RoomBinding, hireId: string,
  prepared: PreparedProvisionV4, actorRoles: readonly string[],
  onProgress?: (progress: ProvisionProgress) => void,
  catalogs: Pick<Catalogs, 'position' | 'template'> = createCatalogs(app, binding)): Promise<ProvisionOutcome> {
  if (!isRoomAdmin(actorRoles)) throw new OnboardingError('NOT_ADMIN');
  const info = await readListInfo(app, binding.hiresListId);
  if (info.list.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
  const ids = resolveV2FieldIds(info.list.fieldDefinitions, V2_HIRE_FIELDS);
  const hire = await readItem(app, binding.hiresListId, hireId);
  const state = checkpoint(field(hire, ids[V2.provision]));
  if (state.operationId !== prepared.input.operationId) throw new OnboardingError('HIRE_EXISTS');
  if (state.employeeId !== prepared.input.employeeId || state.positionId !== prepared.input.positionId ||
    state.startDate !== prepared.input.startDate || state.templateFingerprint !== prepared.fingerprint ||
    (await templateFingerprint(prepared.tree)) !== state.templateFingerprint) fail('TEMPLATE_CHANGED');
  const currentPosition = await catalogs.position(state.positionId);
  if (currentPosition.templateListId !== prepared.position.templateListId ||
    (await templateFingerprint(await catalogs.template(currentPosition.templateListId))) !== state.templateFingerprint) fail('TEMPLATE_CHANGED');
  const learningStage = info.stages.find((stage) => stage.name === LEARNING_STAGE)?._id;
  if (hire.stageId === learningStage) {
    const runId = field(hire, ids[V2.roadmap]);
    if (typeof runId !== 'string' || !runId) throw new OnboardingError('SCHEMA_DRIFT');
    return finishRecount(app, binding, state.positionId, hireId, runId, onProgress);
  }
  return continueProvision(app, binding, prepared, hireId, state, onProgress);
}
