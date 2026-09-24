import { z } from 'zod';
import { normalizeAssignedUserIds } from './assignee';
import { OnboardingError } from './errors';
import type { FieldIds } from './fields';
import type { ContentItem, FileRef, Hire, HireStatus, Position, PositionStatus, Scores } from './models';
import { V2, type SelectLabels } from './v2-fields';
import { isValidIsoDate } from './working-days';

const fileRef = z.object({
  id: z.string().min(1).optional(), _id: z.string().min(1).optional(),
  name: z.string().min(1), mimeType: z.string().optional(), file_type: z.string().optional(),
}).passthrough();
const scoreFraction = z.string().regex(/^(0|[1-9]\d*)\/[1-9]\d*$/).refine((value) => {
  const [numerator, denominator] = value.split('/').map(Number);
  return Number.isSafeInteger(numerator) && Number.isSafeInteger(denominator) && numerator <= denominator;
});
const dayScoreSchema = z.union([
  z.object({ first: z.literal('—') }).strict(),
  z.object({ first: scoreFraction, attempts: z.array(scoreFraction).min(1).optional() }).strict(),
]);
const scoresSchema = z.record(z.string().regex(/^[1-9]\d*$/).refine((key) => Number.isSafeInteger(Number(key))), dayScoreSchema);
const provisionOwnerSchema = z.object({ version: z.literal(1), employeeId: z.string().min(1) }).passthrough();

function fail(itemId: string): never {
  throw new OnboardingError('SCHEMA_DRIFT', itemId);
}

export interface NormalizedHubItem {
  _id: string;
  name: string;
  description?: string;
  stageId: string;
  parentId?: string | null;
  customFields: { fieldId: string; value: unknown }[];
}

type ParsedHubItem = NormalizedHubItem;

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

export function normalizeHubItem(raw: unknown): NormalizedHubItem {
  const item = record(raw);
  if (!item) throw new OnboardingError('SCHEMA_DRIFT', 'ITEM');
  const stage = record(item.stage);
  const id = item._id ?? item.id;
  const stageId = item.stageId ?? item.stage_id ?? stage?._id ?? stage?.id;
  if (typeof id !== 'string' || !id || typeof item.name !== 'string' || !item.name || typeof stageId !== 'string' || !stageId) {
    throw new OnboardingError('SCHEMA_DRIFT', 'ITEM');
  }
  const parentId = item.parentId;
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') throw new OnboardingError('SCHEMA_DRIFT', id);
  const rawFields = item.customFields;
  let customFields: NormalizedHubItem['customFields'] = [];
  if (rawFields !== undefined) {
    if (Array.isArray(rawFields)) {
      customFields = rawFields.map((rawField): { fieldId: string; value: unknown } => {
        const field = record(rawField);
        const fieldId = field?.fieldId ?? field?.fieldDefinitionId;
        if (!field || typeof fieldId !== 'string' || !fieldId || !Object.prototype.hasOwnProperty.call(field, 'value')) throw new OnboardingError('SCHEMA_DRIFT', id);
        return { fieldId, value: field.value };
      });
    } else {
      const fieldMap = record(rawFields);
      if (!fieldMap) throw new OnboardingError('SCHEMA_DRIFT', id);
      customFields = Object.entries(fieldMap).map(([fieldId, value]) => ({ fieldId, value }));
    }
  }
  if (new Set(customFields.map((field) => field.fieldId)).size !== customFields.length) throw new OnboardingError('SCHEMA_DRIFT', id);
  return { _id: id, name: item.name, stageId, ...(typeof item.description === 'string' ? { description: item.description } : {}),
    ...(parentId === undefined ? {} : { parentId }), customFields };
}

function getField(item: ParsedHubItem, ids: FieldIds, name: string): unknown {
  const id = ids[name];
  if (!id) fail(item._id);
  return item.customFields.find((field) => field.fieldId === id)?.value;
}

function textField(item: ParsedHubItem, ids: FieldIds, name: string, required = false): string {
  const value = getField(item, ids, name);
  if ((value === undefined || value === null) && !required) return '';
  if (typeof value !== 'string' || (required && value.trim() === '')) fail(item._id);
  return value;
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function labels(value: string): string[] {
  return value.split(',').map((label) => label.trim().toLowerCase()).filter(Boolean);
}

function parseFiles(value: unknown, itemId: string): FileRef[] {
  if (value === undefined || value === null) return [];
  const result = z.array(fileRef).safeParse(value);
  if (!result.success) return fail(itemId);
  return result.data.map((file) => {
    const id = file.id ?? file._id;
    if (!id) return fail(itemId);
    const mimeType = file.mimeType ?? file.file_type;
    return { id, name: file.name, ...(mimeType ? { mimeType } : {}), raw: file };
  });
}

export function decodeScores(raw: unknown): Scores {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw !== 'string') throw new OnboardingError('SCORES_INVALID');
  let json: unknown;
  try { json = JSON.parse(raw) as unknown; }
  catch { throw new OnboardingError('SCORES_INVALID'); }
  const parsed = scoresSchema.safeParse(json);
  if (!parsed.success) throw new OnboardingError('SCORES_INVALID');
  return parsed.data;
}

export function decodeIsoDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isFinite(raw.getTime())) throw new OnboardingError('SCHEMA_DRIFT', 'DATE');
  const value = raw instanceof Date ? raw.toISOString().slice(0, 10)
    : typeof raw === 'number' && Number.isFinite(raw) ? new Date(raw).toISOString().slice(0, 10)
      : typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw.slice(0, 10) : raw;
  if (typeof value !== 'string' || !isValidIsoDate(value)) throw new OnboardingError('SCHEMA_DRIFT', 'DATE');
  return value;
}

function parseHubItem(raw: unknown): ParsedHubItem {
  return normalizeHubItem(raw);
}

function countField(item: ParsedHubItem, ids: FieldIds, name: string): number {
  const value = getField(item, ids, name);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fail(item._id);
  return value;
}

function nullableTextField(item: ParsedHubItem, ids: FieldIds, name: string): string | null {
  const value = getField(item, ids, name);
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return fail(item._id);
  return value;
}

export function parsePositionItem(raw: unknown, ids: FieldIds, status: PositionStatus): Position {
  const item = parseHubItem(raw);
  return {
    id: item._id, name: item.name, templateListId: textField(item, ids, V2.template, true), status,
    weeks: countField(item, ids, V2.weeks), days: countField(item, ids, V2.days),
    lessons: countField(item, ids, V2.lessons), questions: countField(item, ids, V2.questions),
    missingAnswers: countField(item, ids, V2.missingAnswers), inUse: countField(item, ids, V2.inUse),
  };
}

export function parseHireItem(raw: unknown, ids: FieldIds, status: HireStatus): Hire {
  const item = parseHubItem(raw);
  const employees = normalizeAssignedUserIds(getField(item, ids, V2.employee));
  if (employees.length > 1 || ((status === 'learning' || status === 'done') && employees.length !== 1)) return fail(item._id);
  let pendingEmployee = '';
  if (employees.length === 0 && (status === 'provisioning' || status === 'failed')) {
    const rawCheckpoint = getField(item, ids, V2.provision);
    if (typeof rawCheckpoint !== 'string') return fail(item._id);
    let checkpoint: unknown;
    try { checkpoint = JSON.parse(rawCheckpoint) as unknown; }
    catch { return fail(item._id); }
    const parsed = provisionOwnerSchema.safeParse(checkpoint);
    if (!parsed.success) return fail(item._id);
    pendingEmployee = parsed.data.employeeId;
  }
  const pendingAction = nullableTextField(item, ids, V2.pendingAction);
  if (pendingAction !== null && pendingAction !== 'cancel') return fail(item._id);
  return {
    id: item._id, employeeId: employees[0] ?? pendingEmployee, name: item.name,
    positionId: textField(item, ids, V2.position, true),
    positionName: textField(item, ids, V2.positionName, true),
    totalDays: countField(item, ids, V2.totalDays), startDate: decodeIsoDate(getField(item, ids, V2.startDate)),
    roadmapListId: nullableTextField(item, ids, V2.roadmap), status,
    doneDays: countField(item, ids, V2.doneDays), scores: decodeScores(getField(item, ids, V2.scores)),
    errorCode: nullableTextField(item, ids, V2.errorCode), pendingAction,
  };
}

export function parseTemplateItems(raw: unknown, ids: FieldIds, selectLabels: SelectLabels = {}, allowIncomplete = false): ContentItem[] {
  if (!Array.isArray(raw)) throw new OnboardingError('SCHEMA_DRIFT', 'ITEMS');
  return raw.map((entry): ContentItem => {
    const item = normalizeHubItem(entry);
    const kindValue = getField(item, ids, V2.kind);
    const selected = typeof kindValue === 'object' && kindValue !== null && 'value' in kindValue ? kindValue.value : kindValue;
    const kind = typeof selected === 'string' ? (selectLabels[ids[V2.kind]]?.[selected] ?? selected) : selected;
    const order = getField(item, ids, V2.order);
    if (typeof order !== 'number' || !Number.isInteger(order)) return fail(item._id);
    const base = { id: item._id, name: item.name, stageId: item.stageId, parentId: item.parentId ?? null, order };
    const content = textField(item, ids, V2.content);
    if (kind === 'Ngày') return { ...base, kind: 'day', content };
    if (kind === 'Bài học') return {
      ...base, kind: 'lesson', content, attachments: parseFiles(getField(item, ids, V2.attachments), item._id),
      videos: lines(textField(item, ids, V2.videos)), read: false,
    };
    if (kind === 'Câu hỏi') {
      const options = lines(textField(item, ids, V2.options, !allowIncomplete));
      const correctLabels = labels(textField(item, ids, V2.answers, !allowIncomplete));
      const multiple = getField(item, ids, V2.multiple);
      if (options.length > 10 || new Set(correctLabels).size !== correctLabels.length) return fail(item._id);
      if (!allowIncomplete && (options.length < 2 || correctLabels.length < 1 || correctLabels.some((label) => !/^[a-j]$/.test(label) || label.charCodeAt(0) - 97 >= options.length))) return fail(item._id);
      if (!allowIncomplete && multiple !== undefined && multiple !== null && multiple !== (correctLabels.length > 1)) return fail(item._id);
      return { ...base, kind: 'question', content, options, correctLabels, explanation: textField(item, ids, V2.explanation), selectedLabels: [], correct: null };
    }
    return fail(item._id);
  });
}
