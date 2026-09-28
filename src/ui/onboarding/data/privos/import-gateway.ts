import { importDraftTree } from '../../../../shared/import/draft-tree';
import type { RoomBinding } from '../../domain/models';
import { resolveV2FieldIds, V2, V2_POSITION_FIELDS, V2_TEMPLATE_FIELDS } from '../../domain/v2-fields';
import type { ImportPositionMatch, ImportV4Gateway } from '../../ports/import';
import type { ListReadPort } from '../../ports/lists';
import type { TemplateService } from '../../ports/template';

export function createPrivosImportGateway(deps: {
  binding: RoomBinding;
  read: Pick<ListReadPort, 'readListInfo' | 'queryItems' | 'listRoomLists' | 'isolatedInfo' | 'readAllItems'>;
  templates: TemplateService;
}): ImportV4Gateway {
  const { binding, read, templates } = deps;
  if (!binding.roomId || !binding.positionsListId) throw new Error('ROOM_NOT_CONFIGURED');
  const positionFields = async () => {
    const info = await read.readListInfo(binding.positionsListId);
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
        const page = await read.queryItems(binding.positionsListId, { archived: false,
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
      const lists = (await read.listRoomLists(binding.roomId)).filter((list) => list.key === templateKey);
      if (lists.length > 1) return 'conflict';
      if (!lists.length) return 'ready';
      const list = await read.isolatedInfo(lists[0]._id);
      if (list.roomId !== binding.roomId || !list.isolatedList || list.stages.length !== 1 || list.stages[0].name !== 'Nội dung') return 'conflict';
      const ids = resolveV2FieldIds(list.fieldDefinitions, V2_TEMPLATE_FIELDS);
      const items = await read.readAllItems(list._id);
      if (!items.length) return 'conflict';
      const prefix = `draft:import:${sourceMarker}:`;
      if (items.some((item) => {
        const raw = item.customFields?.find((entry) => entry.fieldId === ids[V2.importSource])?.value;
        return typeof raw !== 'string' || !raw.startsWith(prefix);
      })) return 'conflict';
      const positionIds = await positionFields();
      const linked = await read.queryItems(binding.positionsListId, { archived: false,
        customFields: [{ fieldId: positionIds[V2.template], op: 'is', value: list._id }] }, 2);
      return linked.items.length || linked.nextCursor ? 'conflict' : 'ready';
    },
    saveDraft(position, sourceMarker, templateKey) {
      return templates.save({ name: position.name, status: 'draft', tree: importDraftTree(position),
        importSource: sourceMarker, templateKey });
    },
  };
}
