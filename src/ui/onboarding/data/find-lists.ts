// src/ui/onboarding/data/find-lists.ts
import { OnboardingError } from '../domain/errors';
import { HIRES_FIELDS, HIRES_KEY, HIRE_STAGE_ORDER, TEMPLATE_FIELDS, TEMPLATE_KEY_PREFIX, resolveFieldIds } from '../domain/fields';
import { templateKey } from '../domain/keys';
import type { HubList, ListDiscovery, ListLifecyclePort, ListReadPort } from '../ports/lists';

export const HIRES_LIST_NAME = 'Onboarding · Nhân sự';

export function createListDiscovery(
  read: Pick<ListReadPort, 'listRoomLists' | 'getListInfo'>,
  lifecycle: Pick<ListLifecyclePort, 'createList'>,
): ListDiscovery {
  async function findHiresListByPort(roomId: string): Promise<HubList | null> {
    const lists = await read.listRoomLists(roomId);
    return lists.find((list) => list.key === HIRES_KEY) ?? lists.find((list) => list.name === HIRES_LIST_NAME) ?? null;
  }
  return {
    findHiresList: findHiresListByPort,
    async ensureHiresList(roomId) {
      const existing = await findHiresListByPort(roomId);
      if (existing) return existing;
      return lifecycle.createList({
        roomId, name: HIRES_LIST_NAME, key: HIRES_KEY, isolated: true, fields: HIRES_FIELDS,
        stages: HIRE_STAGE_ORDER.map((name, order) => ({ name, order })),
      });
    },
    async listTemplateLists(roomId) {
      return (await read.listRoomLists(roomId))
        .filter((list) => list.key?.startsWith(TEMPLATE_KEY_PREFIX))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async createTemplateList(roomId, position, stageNames) {
      const key = templateKey(position);
      if (key === TEMPLATE_KEY_PREFIX) throw new OnboardingError('TEMPLATE_INVALID', 'tên vị trí không tạo được key');
      if ((await read.listRoomLists(roomId)).some((list) => list.key === key)) {
        throw new OnboardingError('TEMPLATE_INVALID', `key ${key} đã tồn tại`);
      }
      return lifecycle.createList({ roomId, name: position, key, isolated: true, fields: TEMPLATE_FIELDS,
        stages: stageNames.map((name, order) => ({ name, order })) });
    },
    async loadListWithFields(listId, specs) {
      const { list, stages } = await read.getListInfo(listId);
      const defs = list.fieldDefinitions ?? [];
      const resolved = resolveFieldIds(defs, specs);
      if (!resolved.ok) throw new OnboardingError('SCHEMA_DRIFT', resolved.missing.join(','));
      const typeMismatches = specs.flatMap((spec) => {
        const def = defs.find((candidate) => candidate.name === spec.name);
        return def && def.type !== spec.type ? [`${spec.name}: cần ${spec.type}, đang là ${def.type}`] : [];
      });
      if (typeMismatches.length) throw new OnboardingError('SCHEMA_DRIFT', typeMismatches.join(','));
      return { list, stages, ids: resolved.ids };
    },
  };
}
