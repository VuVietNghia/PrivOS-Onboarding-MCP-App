// src/ui/onboarding/domain/fields.ts
export const HIRES_KEY = 'onb-hires';
export const TEMPLATE_KEY_PREFIX = 'onb-tpl-';
export const RUN_KEY_PREFIX = 'onb-run-';
export const ROOT_ITEM_NAME = 'Tổng quan';

export const F = {
  dayOffset: 'Hạn (ngày thứ N)',
  owner: 'Người thực hiện',
  assignee: 'Nhân sự',
  deadline: 'Hạn chót',
  done: 'Hoàn thành',
  source: 'Nguồn',
  roadmapListId: 'Roadmap list ID',
  position: 'Vị trí',
  startDate: 'Ngày bắt đầu',
  doneCount: 'Đã xong',
  totalCount: 'Tổng task',
  errorCode: 'Mã lỗi',
} as const;

export const OWNER_OPTIONS = ['Nhân sự', 'HR'] as const;
export type TaskOwner = (typeof OWNER_OPTIONS)[number];

export const HIRE_STAGES = {
  provisioning: 'Đang khởi tạo',
  active: 'Đang onboarding',
  completed: 'Hoàn tất',
  failed: 'Khởi tạo lỗi',
} as const;
export const HIRE_STAGE_ORDER = [HIRE_STAGES.provisioning, HIRE_STAGES.active, HIRE_STAGES.completed, HIRE_STAGES.failed];

export interface FieldSpec { name: string; type: string; options?: string[] }

export const TEMPLATE_FIELDS: FieldSpec[] = [
  { name: F.dayOffset, type: 'NUMBER' },
  { name: F.owner, type: 'SELECT', options: [...OWNER_OPTIONS] },
];

export const HIRES_FIELDS: FieldSpec[] = [
  { name: F.assignee, type: 'ASSIGNEE' },
  { name: F.roadmapListId, type: 'TEXT' },
  { name: F.position, type: 'TEXT' },
  { name: F.startDate, type: 'DATE' },
  { name: F.doneCount, type: 'NUMBER' },
  { name: F.totalCount, type: 'NUMBER' },
  { name: F.errorCode, type: 'TEXT' },
];

export const RUN_FIELDS: FieldSpec[] = [
  { name: F.dayOffset, type: 'NUMBER' },
  { name: F.owner, type: 'SELECT', options: [...OWNER_OPTIONS] },
  { name: F.assignee, type: 'ASSIGNEE' },
  { name: F.deadline, type: 'DEADLINE' },
  { name: F.done, type: 'CHECKBOX' },
  { name: F.source, type: 'TEXT' },
  { name: F.startDate, type: 'DATE' },
];

export interface FieldDef { _id: string; name: string; type: string; options?: { _id?: string; value: string }[] }

export type FieldIds = Record<string, string>;

export function resolveFieldIds(defs: FieldDef[], specs: FieldSpec[]): { ok: true; ids: FieldIds } | { ok: false; missing: string[] } {
  const ids: FieldIds = {};
  const missing: string[] = [];
  for (const spec of specs) {
    const def = defs.find((d) => d.name === spec.name);
    if (def) ids[spec.name] = def._id;
    else missing.push(spec.name);
  }
  return missing.length ? { ok: false, missing } : { ok: true, ids };
}

export interface HubItem {
  _id: string;
  name?: string;
  description?: string;
  stageId?: string;
  parentId?: string | null;
  customFields?: { fieldId: string; value: unknown }[];
}

export function fieldValue(item: HubItem, fieldId: string | undefined): unknown {
  if (!fieldId) return undefined;
  return item.customFields?.find((cf) => cf.fieldId === fieldId)?.value;
}
