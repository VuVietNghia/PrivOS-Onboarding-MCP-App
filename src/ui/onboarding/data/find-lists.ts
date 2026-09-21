// src/ui/onboarding/data/find-lists.ts
import type { McpApp } from '@privos_ai/app-react';
import { OnboardingError } from '../domain/errors';
import { HIRES_FIELDS, HIRES_KEY, HIRE_STAGE_ORDER, TEMPLATE_FIELDS, TEMPLATE_KEY_PREFIX, resolveFieldIds, type FieldIds, type FieldSpec } from '../domain/fields';
import { templateKey } from '../domain/keys';
import type { StageRef } from '../domain/roadmap-plan';
import { createList, getListInfo, listRoomLists, type HubList } from './onboarding-lists';

export const HIRES_LIST_NAME = 'Onboarding · Nhân sự';

// Fallback theo tên có thể trả nhầm list trùng tên do người dùng tự đặt với
// cấu trúc field khác hẳn; caller BẮT BUỘC gọi loadListWithFields trước khi
// ghi để SCHEMA_DRIFT chặn kịp.
export async function findHiresList(app: McpApp, roomId: string): Promise<HubList | null> {
  const lists = await listRoomLists(app, roomId);
  return lists.find((l) => l.key === HIRES_KEY) ?? lists.find((l) => l.name === HIRES_LIST_NAME) ?? null;
}

export async function ensureHiresList(app: McpApp, roomId: string): Promise<HubList> {
  const existing = await findHiresList(app, roomId);
  if (existing) return existing;
  return createList(app, {
    roomId, name: HIRES_LIST_NAME, key: HIRES_KEY, isolated: true, fields: HIRES_FIELDS,
    stages: HIRE_STAGE_ORDER.map((name, order) => ({ name, order })),
  });
}

export async function listTemplateLists(app: McpApp, roomId: string): Promise<HubList[]> {
  const lists = await listRoomLists(app, roomId);
  return lists.filter((l) => l.key?.startsWith(TEMPLATE_KEY_PREFIX)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createTemplateList(app: McpApp, roomId: string, position: string, stageNames: string[]): Promise<HubList> {
  const key = templateKey(position);
  if (key === TEMPLATE_KEY_PREFIX) throw new OnboardingError('TEMPLATE_INVALID', 'tên vị trí không tạo được key');
  const lists = await listRoomLists(app, roomId);
  if (lists.some((l) => l.key === key)) throw new OnboardingError('TEMPLATE_INVALID', `key ${key} đã tồn tại`);
  return createList(app, {
    roomId, name: position, key, isolated: true, fields: TEMPLATE_FIELDS,
    stages: stageNames.map((name, order) => ({ name, order })),
  });
}

export async function loadListWithFields(app: McpApp, listId: string, specs: FieldSpec[]): Promise<{ list: HubList; stages: StageRef[]; ids: FieldIds }> {
  const { list, stages } = await getListInfo(app, listId);
  const defs = list.fieldDefinitions ?? [];
  const resolved = resolveFieldIds(defs, specs);
  if (!resolved.ok) throw new OnboardingError('SCHEMA_DRIFT', resolved.missing.join(','));
  const typeMismatches: string[] = [];
  for (const spec of specs) {
    const def = defs.find((d) => d.name === spec.name);
    if (def && def.type !== spec.type) typeMismatches.push(`${spec.name}: cần ${spec.type}, đang là ${def.type}`);
  }
  if (typeMismatches.length) throw new OnboardingError('SCHEMA_DRIFT', typeMismatches.join(', '));
  return { list, stages, ids: resolved.ids };
}
