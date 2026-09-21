// src/ui/onboarding/domain/schemas.ts
import { z } from 'zod';
import { normalizeAssignedUserIds } from './assignee';
import { F, OWNER_OPTIONS, fieldValue, type FieldIds, type HubItem, type TaskOwner } from './fields';
import { isValidIsoDate } from './working-days';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; itemId: string; issues: string[] };

// Hub có thể chuẩn hóa field kiểu DATE/DEADLINE thành timestamp đầy đủ (vd.
// '2026-09-25T00:00:00.000Z') hoặc trả về Date/epoch ms tùy driver, thay vì
// giữ nguyên chuỗi 'YYYY-MM-DD' app đã ghi. Preprocess về đúng 10 ký tự
// 'YYYY-MM-DD' TRƯỚC khi validate — cùng lập luận đã dùng để nới `checkbox`
// nhận `1`/`'1'`. Không preprocess thì mọi task/hồ sơ rơi vào invalid[] và
// mỗi lần resume sẽ tạo lại toàn bộ task (have-set rỗng).
const isoDate = z.preprocess((v: unknown) => {
  if (typeof v === 'string' && v.length > 10 && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10))) return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  return v;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').refine(isValidIsoDate, 'Ngày không có trên lịch'));
const numberOrZero = z.preprocess((v) => (v === undefined || v === null || v === '' ? 0 : v), z.coerce.number().int().min(0));
const textOrNull = z.preprocess((v) => (v === undefined || v === '' ? null : v), z.string().nullable());
const checkbox = z.preprocess((v: unknown) => v === true || v === 'true' || v === 1 || v === '1', z.boolean());
const owner = z.enum(OWNER_OPTIONS);

export interface TemplateTask { id: string; name: string; stageId: string; dayOffset: number; owner: TaskOwner }
export interface Hire {
  id: string; name: string; stageId: string; employeeIds: string[]; roadmapListId: string | null; position: string;
  startDate: string; doneCount: number; totalCount: number; errorCode: string | null;
}
export interface RoadmapTask {
  id: string; name: string; stageId: string; parentId: string | null; dayOffset: number; owner: TaskOwner;
  assigneeIds: string[]; deadline: string | null; done: boolean; sourceId: string | null;
}

const templateTaskSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), stageId: z.string().min(1),
  dayOffset: z.coerce.number().int().min(0), owner,
});

const hireSchema = z.object({
  id: z.string().min(1), name: z.string(), stageId: z.string().min(1), employeeIds: z.array(z.string()),
  roadmapListId: textOrNull, position: z.string(), startDate: isoDate,
  doneCount: numberOrZero, totalCount: numberOrZero, errorCode: textOrNull,
});

const roadmapTaskSchema = templateTaskSchema.extend({
  parentId: z.string().nullable(), assigneeIds: z.array(z.string()),
  deadline: z.preprocess((v) => (v === undefined || v === '' ? null : v), isoDate.nullable()),
  done: checkbox,
  sourceId: textOrNull,
});

function wrap<T>(itemId: string, result: z.SafeParseReturnType<unknown, T>): ParseResult<T> {
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, itemId, issues: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

export function parseTemplateTask(item: HubItem, ids: FieldIds): ParseResult<TemplateTask> {
  return wrap(item._id, templateTaskSchema.safeParse({
    id: item._id, name: item.name, stageId: item.stageId,
    dayOffset: fieldValue(item, ids[F.dayOffset]), owner: fieldValue(item, ids[F.owner]),
  }));
}

export function parseHire(item: HubItem, ids: FieldIds): ParseResult<Hire> {
  return wrap(item._id, hireSchema.safeParse({
    id: item._id, name: item.name ?? '', stageId: item.stageId,
    employeeIds: normalizeAssignedUserIds(fieldValue(item, ids[F.assignee])),
    roadmapListId: fieldValue(item, ids[F.roadmapListId]),
    position: fieldValue(item, ids[F.position]) ?? '',
    startDate: fieldValue(item, ids[F.startDate]),
    doneCount: fieldValue(item, ids[F.doneCount]),
    totalCount: fieldValue(item, ids[F.totalCount]),
    errorCode: fieldValue(item, ids[F.errorCode]),
  }));
}

export function parseRoadmapTask(item: HubItem, ids: FieldIds): ParseResult<RoadmapTask> {
  return wrap(item._id, roadmapTaskSchema.safeParse({
    id: item._id, name: item.name, stageId: item.stageId, parentId: typeof item.parentId === 'string' && item.parentId.trim() !== '' ? item.parentId : null,
    dayOffset: fieldValue(item, ids[F.dayOffset]), owner: fieldValue(item, ids[F.owner]),
    assigneeIds: normalizeAssignedUserIds(fieldValue(item, ids[F.assignee])),
    deadline: fieldValue(item, ids[F.deadline]), done: fieldValue(item, ids[F.done]),
    sourceId: fieldValue(item, ids[F.source]),
  }));
}
