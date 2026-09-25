import type { McpApp } from '@privos_ai/app-react';
import { createIsolatedListViaTool, getIsolatedListViaTool } from '../data/isolated-lists';
import { appendFileMarker } from '../data/file-refs';
import { createItem, deleteItem, listRoomLists, updateItem } from '../data/onboarding-lists';
import { readAllItems, readItem } from '../data/v2-lists';
import { OnboardingError } from '../domain/errors';
import type { ContentItem, RoomBinding, TemplateTree, Week } from '../domain/models';
import { decodeTemplateTree, encodeTemplateFields } from '../domain/template-item-model';
import { validateReady } from '../domain/template-readiness';
import { V2, V2_POSITION_FIELDS, V2_TEMPLATE_FIELDS, resolveV2FieldIds } from '../domain/v2-fields';
import { unwrapToolResult } from '../data/tool-result';

const CONTENT_STAGE = 'Nội dung';
const DRAFT_STAGE = 'Đang soạn';
const READY_STAGE = 'Sẵn sàng';
const DISABLED_STAGE = 'Ngừng dùng';

function fieldValue(item: { customFields?: { fieldId: string; value: unknown }[] }, fieldId: string): unknown {
  return item.customFields?.find((field) => field.fieldId === fieldId)?.value;
}

function count(tree: TemplateTree): { weeks: number; days: number; lessons: number; questions: number; missingAnswers: number } {
  return {
    weeks: tree.weeks.length,
    days: tree.items.filter((item) => item.kind === 'day').length,
    lessons: tree.items.filter((item) => item.kind === 'lesson').length,
    questions: tree.items.filter((item) => item.kind === 'question').length,
    missingAnswers: tree.items.filter((item) => item.kind === 'question' && item.correctLabels.length === 0).length,
  };
}

function registryFields(ids: Record<string, string>, listId: string, tree: TemplateTree, importSource?: string): { fieldId: string; value: unknown }[] {
  const totals = count(tree);
  return [
    { fieldId: ids[V2.template], value: listId },
    { fieldId: ids[V2.weeks], value: totals.weeks },
    { fieldId: ids[V2.days], value: totals.days },
    { fieldId: ids[V2.lessons], value: totals.lessons },
    { fieldId: ids[V2.questions], value: totals.questions },
    { fieldId: ids[V2.missingAnswers], value: totals.missingAnswers },
    ...(importSource ? [{ fieldId: ids[V2.importSource], value: importSource }] : []),
  ];
}

function isDraftId(id: string): boolean { return id.startsWith('draft:'); }

function attachmentIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const raw: Record<string, unknown> = entry;
    const id = raw._id ?? raw.id;
    if (typeof id !== 'string' || !id) return null;
    ids.push(id);
  }
  return ids;
}

function scalarFieldsPersisted(
  item: { customFields?: { fieldId: string; value: unknown }[] },
  encoded: readonly { fieldId: string; value: unknown }[],
  ids: Record<string, string>,
): boolean {
  const emptyTextIds = new Set([ids[V2.content], ids[V2.options], ids[V2.answers], ids[V2.explanation], ids[V2.videos]]);
  return encoded.every(({ fieldId, value }) => {
    if (fieldId === ids[V2.kind]) return true;
    const actual = fieldValue(item, fieldId);
    if (fieldId === ids[V2.attachments]) {
      const expectedIds = attachmentIds(value);
      const actualIds = attachmentIds(actual);
      return expectedIds !== null && actualIds !== null && JSON.stringify(actualIds) === JSON.stringify(expectedIds);
    }
    if ((actual === undefined || actual === null) &&
      ((value === '' && emptyTextIds.has(fieldId)) || (value === false && fieldId === ids[V2.multiple]))) return true;
    return JSON.stringify(actual) === JSON.stringify(value);
  });
}

function descriptionFor(node: Week | ContentItem, previous?: string): string | undefined {
  if (!('kind' in node) || node.kind !== 'lesson') return previous;
  let description = (previous ?? '').replace(/(?:^|\n)\[fileId:[^\]\s]+\]/g, '').trim();
  for (const ref of node.attachments) description = appendFileMarker(description, ref.id);
  return description;
}

function listName(positionName: string, key: string): string { return `Onboarding template · ${positionName} · ${key.slice(-8)}`; }

async function writeTree(app: McpApp, listId: string, roomId: string, draft: TemplateTree): Promise<TemplateTree> {
  const info = await getIsolatedListViaTool(app, listId);
  if (!info.isolatedList || info.roomId !== roomId || info.stages.length !== 1 || info.stages[0].name !== CONTENT_STAGE) throw new OnboardingError('SCHEMA_DRIFT');
  if (!info.fieldDefinitions.some((definition) => definition.name === V2.parent && definition.type === 'TEXT')) {
    throw new OnboardingError('SCHEMA_MIGRATION_REQUIRED', V2.parent);
  }
  const fields = resolveV2FieldIds(info.fieldDefinitions, V2_TEMPLATE_FIELDS);
  const stageId = info.stages[0]._id;
  const existing = await readAllItems(app, listId);
  const byId = new Map(existing.map((item) => [item._id, item]));
  const bySource = new Map<string, typeof existing[number]>();
  for (const item of existing) {
    const source = fieldValue(item, fields[V2.importSource]);
    if (typeof source === 'string' && source.startsWith('draft:')) {
      if (bySource.has(source)) throw new OnboardingError('SCHEMA_DRIFT');
      bySource.set(source, item);
    }
  }
  const retained = new Set<string>();
  const mapped = new Map<string, string>();
  const writeNode = async (node: Week | ContentItem, parentId?: string): Promise<void> => {
    const previous = byId.get(node.id) ?? bySource.get(node.id);
    const encoded = encodeTemplateFields(node, info.fieldDefinitions, parentId);
    const description = descriptionFor(node, previous?.description);
    if (previous) {
      if (fieldValue(previous, fields[V2.parent]) !== (parentId ?? '')) throw new OnboardingError('SCHEMA_DRIFT');
      await updateItem(app, { itemId: previous._id, name: node.name, ...(description !== undefined ? { description } : {}), customFields: encoded });
      const verified = await readItem(app, listId, previous._id);
      if (verified.name !== node.name || verified.stageId !== stageId || fieldValue(verified, fields[V2.parent]) !== (parentId ?? '') ||
        (description !== undefined && verified.description !== description) || !scalarFieldsPersisted(verified, encoded, fields)) throw new OnboardingError('SCHEMA_DRIFT');
      mapped.set(node.id, previous._id);
      retained.add(previous._id);
      return;
    }
    if (!isDraftId(node.id)) throw new OnboardingError('SCHEMA_DRIFT');
    let created: typeof existing[number];
    try {
      created = await createItem(app, { listId, name: node.name, stageId, ...(description !== undefined ? { description } : {}),
        customFields: encoded });
    } catch (error) {
      const matches = (await readAllItems(app, listId)).filter((item) => fieldValue(item, fields[V2.importSource]) === node.id);
      if (matches.length !== 1) throw error;
      created = matches[0];
    }
    if (created.stageId !== stageId || created.name !== node.name || fieldValue(created, fields[V2.parent]) !== (parentId ?? '') ||
      (description !== undefined && created.description !== description) || !scalarFieldsPersisted(created, encoded, fields)) throw new OnboardingError('SCHEMA_DRIFT');
    mapped.set(node.id, created._id);
    retained.add(created._id);
  };
  for (const week of [...draft.weeks].sort((a, b) => a.order - b.order)) await writeNode(week);
  for (const day of draft.items.filter((item) => item.kind === 'day').sort((a, b) => a.order - b.order)) {
    const weekId = mapped.get(day.stageId);
    if (!weekId) throw new OnboardingError('TEMPLATE_INVALID');
    await writeNode(day, weekId);
  }
  for (const child of draft.items.filter((item) => item.kind !== 'day')) {
    const parentId = child.parentId ? mapped.get(child.parentId) : undefined;
    if (!parentId) throw new OnboardingError('TEMPLATE_INVALID');
    await writeNode(child, parentId);
  }
  const stale = existing.filter((item) => !retained.has(item._id));
  const staleIds = new Set(stale.map((item) => item._id));
  if (existing.some((item) => retained.has(item._id) && staleIds.has(String(fieldValue(item, fields[V2.parent]) ?? '')))) throw new OnboardingError('SCHEMA_DRIFT');
  const depth = (item: typeof stale[number]): number => {
    let count = 0;
    const initialParent = fieldValue(item, fields[V2.parent]);
    let parent = typeof initialParent === 'string' ? byId.get(initialParent) : undefined;
    while (parent) {
      count += 1;
      if (count > 3) throw new OnboardingError('SCHEMA_DRIFT');
      const parentId = fieldValue(parent, fields[V2.parent]);
      parent = typeof parentId === 'string' ? byId.get(parentId) : undefined;
    }
    return count;
  };
  for (const item of stale.sort((a, b) => depth(b) - depth(a))) await deleteItem(app, item._id);
  const readback = decodeTemplateTree(await readAllItems(app, listId), info.fieldDefinitions, stageId);
  if (readback.weeks.length !== draft.weeks.length || readback.items.length !== draft.items.length) throw new OnboardingError('SCHEMA_DRIFT');
  return readback;
}

export interface SaveTemplateV4Input {
  positionId?: string;
  tree: TemplateTree;
  name: string;
  status: 'draft' | 'ready';
  importSource?: string;
  templateKey?: string;
}

export async function saveTemplateV4(app: McpApp, binding: RoomBinding, input: SaveTemplateV4Input): Promise<string> {
  const name = input.name.trim();
  if (!name || !input.tree.weeks.length) throw new OnboardingError('TEMPLATE_INVALID');
  if (input.status === 'ready' && validateReady(input.tree, name).length) throw new OnboardingError('TEMPLATE_INVALID');
  const positionInfo = await getIsolatedListViaTool(app, binding.positionsListId);
  if (!positionInfo.isolatedList || positionInfo.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
  const positionIds = resolveV2FieldIds(positionInfo.fieldDefinitions, V2_POSITION_FIELDS);
  const draftStage = positionInfo.stages.find((stage) => stage.name === DRAFT_STAGE)?._id;
  const readyStage = positionInfo.stages.find((stage) => stage.name === READY_STAGE)?._id;
  const disabledStage = positionInfo.stages.find((stage) => stage.name === DISABLED_STAGE)?._id;
  if (!draftStage || !readyStage || !disabledStage) throw new OnboardingError('SCHEMA_DRIFT');
  let positionId = input.positionId;
  let listId: string;
  if (positionId) {
    const position = await readItem(app, binding.positionsListId, positionId);
    if (position.stageId !== draftStage && position.stageId !== readyStage && position.stageId !== disabledStage) throw new OnboardingError('SCHEMA_DRIFT');
    const linked = fieldValue(position, positionIds[V2.template]);
    if (typeof linked !== 'string' || !linked) throw new OnboardingError('SCHEMA_DRIFT');
    listId = linked;
  } else {
    const key = input.templateKey ?? `onb-tpl-${crypto.randomUUID()}`;
    if (!/^onb-tpl-[a-zA-Z0-9_-]+$/.test(key)) throw new OnboardingError('TEMPLATE_INVALID');
    const existing = input.templateKey ? (await listRoomLists(app, binding.roomId)).filter((list) => list.key === key) : [];
    if (existing.length > 1) throw new OnboardingError('SCHEMA_DRIFT');
    if (existing.length === 1) listId = existing[0]._id;
    else {
      try {
        const created = await createIsolatedListViaTool(app, { roomId: binding.roomId, name: listName(name, key), key,
          isolated: true, fields: [...V2_TEMPLATE_FIELDS], stages: [{ name: CONTENT_STAGE, color: '#3b82f6' }] });
        listId = created._id;
      } catch (error) {
        const recovered = (await listRoomLists(app, binding.roomId)).filter((list) => list.key === key);
        if (recovered.length !== 1) throw error;
        listId = recovered[0]._id;
      }
    }
  }
  if (positionId && input.status === 'draft') {
    const current = await readItem(app, binding.positionsListId, positionId);
    if (current.stageId !== draftStage) unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: positionId, stageId: draftStage } }));
  }
  const readback = await writeTree(app, listId, binding.roomId, input.tree);
  if (input.status === 'ready' && validateReady(readback, name).length) throw new OnboardingError('TEMPLATE_INVALID');
  const expectedRegistryFields = registryFields(positionIds, listId, readback, input.importSource);
  if (!positionId) {
    const created = await createItem(app, { listId: binding.positionsListId, name, stageId: draftStage,
      customFields: [...expectedRegistryFields, { fieldId: positionIds[V2.inUse], value: 0 }] });
    positionId = created._id;
  } else {
    await updateItem(app, { itemId: positionId, name, customFields: expectedRegistryFields });
  }
  if (input.status === 'ready') {
    unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', arguments: { itemId: positionId, stageId: readyStage } }));
  }
  const verified = await readItem(app, binding.positionsListId, positionId);
  if (verified.name !== name || verified.stageId !== (input.status === 'ready' ? readyStage : draftStage) ||
    !expectedRegistryFields.every(({ fieldId, value }) => fieldValue(verified, fieldId) === value)) throw new OnboardingError('SCHEMA_DRIFT');
  return positionId;
}
