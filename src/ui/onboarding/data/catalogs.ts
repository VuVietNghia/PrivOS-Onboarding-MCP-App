import type { McpApp } from '@privos_ai/app-react';
import { OnboardingError } from '../domain/errors';
import { parseHireItem, parsePositionItem, parseTemplateItems } from '../domain/v2-schemas';
import { resolveSelectLabels, resolveV2FieldIds, V2, V2_HIRE_FIELDS, V2_POSITION_FIELDS, V2_TEMPLATE_FIELDS } from '../domain/v2-fields';
import { decodeTemplateTree } from '../domain/template-item-model';
import type { CatalogFilter, Hire, HireStatus, Page, Position, PositionStatus, Roadmap, RoomBinding, TemplateTree } from '../domain/models';
import { queryItems, readAllItems, readItem, readListInfo } from './v2-lists';
import { createRequestBudget } from './request-budget';
import { unwrapToolResult } from './tool-result';

export interface Catalogs {
  positions(filter: CatalogFilter, cursor?: string): Promise<Page<Position>>;
  hires(filter: CatalogFilter, cursor?: string): Promise<Page<Hire>>;
  position(id: string): Promise<Position>;
  hire(id: string): Promise<Hire>;
  template(listId: string): Promise<TemplateTree>;
  roadmap(listId: string): Promise<Roadmap>;
}

const POSITION_STAGES: Readonly<Record<string, PositionStatus>> = {
  'Đang soạn': 'draft', 'Sẵn sàng': 'ready', 'Ngừng dùng': 'disabled',
};
const HIRE_STAGES: Readonly<Record<string, HireStatus>> = {
  'Đang khởi tạo': 'provisioning', 'Đang học': 'learning', 'Hoàn tất': 'done',
  'Khởi tạo lỗi': 'failed', 'Đã huỷ': 'cancelled',
};

function stageStatus<T extends string>(stages: readonly { _id: string; name: string }[], stageId: string | undefined, names: Readonly<Record<string, T>>): T {
  const stage = stages.find((candidate) => candidate._id === stageId);
  const status = stage ? names[stage.name] : undefined;
  if (!status) throw new OnboardingError('SCHEMA_DRIFT');
  return status;
}

function selectedStageId<T extends string>(stages: readonly { _id: string; name: string }[], filter: CatalogFilter, names: Readonly<Record<string, T>>): string | undefined {
  if (filter.status && filter.stageId) throw new OnboardingError('FILTER_INVALID');
  if (!filter.status) return filter.stageId;
  const stage = stages.find((candidate) => names[candidate.name] === filter.status);
  if (!stage) throw new OnboardingError('SCHEMA_DRIFT');
  return stage._id;
}

function conditions(text: string): { fieldId: string; op: 'contains' | 'is'; value: string }[] {
  const value = text.trim();
  return value ? [{ fieldId: 'name', op: 'contains', value }] : [];
}

export function createCatalogs(app: McpApp, binding: RoomBinding): Catalogs {
  if (!binding.roomId || !binding.positionsListId || !binding.hiresListId) throw new OnboardingError('ROOM_NOT_CONFIGURED');
  const budget = createRequestBudget();
  // Schedule mediated List reads through the same per-catalog budget.
  const readApp = new Proxy(app, {
    get(target, key, receiver) {
      if (key === 'callServerTool') return (request: { name: string; arguments: Record<string, unknown> }) => budget.run(async () => unwrapToolResult(await app.callServerTool(request)));
      return Reflect.get(target, key, receiver);
    },
  });
  const infoById = new Map<string, ReturnType<typeof readListInfo>>();
  function info(listId: string): ReturnType<typeof readListInfo> {
    const existing = infoById.get(listId);
    if (existing) return existing;
    const pending = readListInfo(readApp, listId).then((detail) => {
      if (detail.list.roomId !== binding.roomId) throw new OnboardingError('SCHEMA_DRIFT');
      return detail;
    });
    infoById.set(listId, pending);
    void pending.catch(() => { if (infoById.get(listId) === pending) infoById.delete(listId); });
    return pending;
  }

  return {
    async positions(filter, cursor) {
      const { list, stages } = await info(binding.positionsListId);
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_POSITION_FIELDS);
      const stageId = selectedStageId(stages, filter, POSITION_STAGES);
      const page = await queryItems(readApp, binding.positionsListId, {
        archived: false, ...(stageId ? { stageId } : {}),
        ...(filter.text.trim() ? { customFields: conditions(filter.text) } : {}),
      }, 50, cursor);
      return { items: page.items.map((item) => parsePositionItem(item, ids, stageStatus(stages, item.stageId, POSITION_STAGES))), nextCursor: page.nextCursor };
    },
    async hires(filter, cursor) {
      const { list, stages } = await info(binding.hiresListId);
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_HIRE_FIELDS);
      const stageId = selectedStageId(stages, filter, HIRE_STAGES);
      const fieldConditions = conditions(filter.text);
      if (filter.positionId) fieldConditions.push({ fieldId: ids[V2.position], op: 'is', value: filter.positionId });
      const page = await queryItems(readApp, binding.hiresListId, {
        archived: false, ...(stageId ? { stageId } : {}),
        ...(fieldConditions.length ? { customFields: fieldConditions } : {}),
      }, 50, cursor);
      return { items: page.items.map((item) => parseHireItem(item, ids, stageStatus(stages, item.stageId, HIRE_STAGES))), nextCursor: page.nextCursor };
    },
    async position(id) {
      const { list, stages } = await info(binding.positionsListId);
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_POSITION_FIELDS);
      const item = await readItem(readApp, binding.positionsListId, id);
      return parsePositionItem(item, ids, stageStatus(stages, item.stageId, POSITION_STAGES));
    },
    async hire(id) {
      const { list, stages } = await info(binding.hiresListId);
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_HIRE_FIELDS);
      const item = await readItem(readApp, binding.hiresListId, id);
      return parseHireItem(item, ids, stageStatus(stages, item.stageId, HIRE_STAGES));
    },
    async template(listId) {
      const { list, stages } = await info(listId);
      if (!list.fieldDefinitions.some((definition) => definition.name === V2.parent && definition.type === 'TEXT')) {
        throw new OnboardingError('SCHEMA_MIGRATION_REQUIRED', V2.parent);
      }
      const rows = await readAllItems(readApp, listId);
      if (stages.length === 1 && stages[0].name === 'Nội dung') return decodeTemplateTree(rows, list.fieldDefinitions, stages[0]._id);
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_TEMPLATE_FIELDS);
      const items = parseTemplateItems(rows, ids, resolveSelectLabels(list.fieldDefinitions));
      return { weeks: [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((stage, order) => ({ id: stage._id, name: stage.name, order })), items };
    },
    async roadmap(_listId) { throw new Error('ROADMAP_ACCESS_UNVERIFIED'); },
  };
}
