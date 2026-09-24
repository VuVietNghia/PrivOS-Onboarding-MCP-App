import type { McpApp } from '@privos_ai/app-react';
import type { ImportedPosition } from '../../../../scripts/onboarding-import/models';
import { preflightPosition, type ImportPreflight } from '../../../../scripts/onboarding-import/preflight';
import { getIsolatedListViaTool } from '../data/isolated-lists';
import { listRoomLists } from '../data/onboarding-lists';
import { createRequestBudget } from '../data/request-budget';
import { queryItems, readAllItems, readListInfo } from '../data/v2-lists';
import type { RoomBinding, TemplateTree } from '../domain/models';
import { resolveV2FieldIds, V2, V2_POSITION_FIELDS, V2_TEMPLATE_FIELDS } from '../domain/v2-fields';
import { saveTemplateV4 } from './save-template-v4';

export interface ImportPositionMatch { id: string; sourceMarker: string }
export interface ImportV4Gateway {
  findPositionsBySource(sourceKey: string): Promise<ImportPositionMatch[]>;
  checkTemplateKey(templateKey: string, sourceMarker: string): Promise<'ready' | 'conflict'>;
  saveDraft(position: ImportedPosition, sourceMarker: string, templateKey: string): Promise<string>;
}

export interface ImportPositionOutcome {
  state: 'created' | 'existing';
  positionId: string;
  preflight: ImportPreflight;
}

export function importSourceMarker(position: ImportedPosition): string {
  return `${position.sourceKey}:${position.sourceFingerprint}`;
}

export async function importTemplateKey(sourceKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceKey));
  return `onb-tpl-import-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function draftId(sourceMarker: string, sourceId: string): string {
  return `draft:import:${sourceMarker}:${sourceId}`;
}

export function importDraftTree(position: ImportedPosition): TemplateTree {
  const marker = importSourceMarker(position);
  return {
    weeks: position.tree.weeks.map((week) => ({ ...week, id: draftId(marker, week.id) })),
    items: position.tree.items.map((item) => ({
      ...item, id: draftId(marker, item.id),
      stageId: draftId(marker, item.stageId),
      parentId: item.parentId === null ? null : draftId(marker, item.parentId),
    })),
  };
}

export async function importPositionV4(gateway: ImportV4Gateway, position: ImportedPosition): Promise<ImportPositionOutcome> {
  const preflight = preflightPosition(position);
  const marker = importSourceMarker(position);
  const find = () => gateway.findPositionsBySource(position.sourceKey);
  const matches = await find();
  if (matches.length > 1) throw new Error('IMPORT_SOURCE_CONFLICT');
  if (matches.length === 1) {
    if (matches[0].sourceMarker !== marker) throw new Error('IMPORT_SOURCE_CHANGED');
    return { state: 'existing', positionId: matches[0].id, preflight };
  }
  const key = await importTemplateKey(position.sourceKey);
  if (await gateway.checkTemplateKey(key, marker) === 'conflict') throw new Error('IMPORT_ORPHAN_CONFLICT');
  let positionId: string;
  try { positionId = await gateway.saveDraft(position, marker, key); }
  catch (error) {
    const recovered = await find();
    if (recovered.length !== 1 || recovered[0].sourceMarker !== marker) throw error;
    positionId = recovered[0].id;
  }
  const verified = await find();
  if (verified.length !== 1 || verified[0].id !== positionId || verified[0].sourceMarker !== marker) throw new Error('IMPORT_SOURCE_CONFLICT');
  return { state: 'created', positionId, preflight };
}

export function createMcpImportV4Gateway(app: McpApp, binding: RoomBinding): ImportV4Gateway {
  if (!binding.roomId || !binding.positionsListId) throw new Error('ROOM_NOT_CONFIGURED');
  const budget = createRequestBudget({ maxConcurrent: 4, maxPerWindow: 100 });
  const mediatedApp = new Proxy(app, {
    get(target, key, receiver) {
      if (key === 'callServerTool') return (request: { name: string; arguments: Record<string, unknown> }) =>
        budget.run(() => app.callServerTool(request));
      return Reflect.get(target, key, receiver);
    },
  });
  const positionFields = async () => {
    const info = await readListInfo(mediatedApp, binding.positionsListId);
    if (info.list.roomId !== binding.roomId) throw new Error('ROOM_MISMATCH');
    return resolveV2FieldIds(info.list.fieldDefinitions, V2_POSITION_FIELDS);
  };
  return {
    async findPositionsBySource(sourceKey) {
      const ids = await positionFields();
      const matches: ImportPositionMatch[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await queryItems(mediatedApp, binding.positionsListId, { archived: false,
          customFields: [{ fieldId: ids[V2.importSource], op: 'contains', value: `${sourceKey}:` }] }, 200, cursor);
        for (const item of page.items) {
          const raw = item.customFields?.find((entry) => entry.fieldId === ids[V2.importSource])?.value;
          if (typeof raw === 'string' && raw.startsWith(`${sourceKey}:`)) matches.push({ id: item._id, sourceMarker: raw });
        }
        if (page.nextCursor && seen.has(page.nextCursor)) throw new Error('PAGINATION_INVALID');
        if (page.nextCursor) seen.add(page.nextCursor);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return matches;
    },
    async checkTemplateKey(templateKey, sourceMarker) {
      const lists = (await listRoomLists(mediatedApp, binding.roomId)).filter((list) => list.key === templateKey);
      if (lists.length > 1) return 'conflict';
      if (!lists.length) return 'ready';
      const list = await getIsolatedListViaTool(mediatedApp, lists[0]._id);
      if (list.roomId !== binding.roomId || !list.isolatedList || list.stages.length !== 1 || list.stages[0].name !== 'Nội dung') return 'conflict';
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_TEMPLATE_FIELDS);
      const items = await readAllItems(mediatedApp, list._id);
      // An empty orphan has no source fingerprint to prove it belongs to this import.
      if (!items.length) return 'conflict';
      const prefix = `draft:import:${sourceMarker}:`;
      if (items.some((item) => {
        const raw = item.customFields?.find((entry) => entry.fieldId === ids[V2.importSource])?.value;
        return typeof raw !== 'string' || !raw.startsWith(prefix);
      })) return 'conflict';
      const positionIds = await positionFields();
      const linked = await queryItems(mediatedApp, binding.positionsListId, { archived: false,
        customFields: [{ fieldId: positionIds[V2.template], op: 'is', value: list._id }] }, 2);
      return linked.items.length || linked.nextCursor ? 'conflict' : 'ready';
    },
    saveDraft(position, sourceMarker, templateKey) {
      return saveTemplateV4(mediatedApp, binding, { name: position.name, status: 'draft', tree: importDraftTree(position),
        importSource: sourceMarker, templateKey });
    },
  };
}
