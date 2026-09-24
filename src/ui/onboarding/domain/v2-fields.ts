import { OnboardingError } from './errors';
import type { FieldDef, FieldIds, FieldSpec } from './fields';

export const V2 = {
  template: 'Template', weeks: 'Số tuần', days: 'Số ngày', lessons: 'Số bài học', questions: 'Số câu hỏi', missingAnswers: 'Thiếu đáp án', inUse: 'Đang dùng', importSource: 'Nguồn nhập',
  employee: 'Nhân sự', position: 'Vị trí', startDate: 'Ngày bắt đầu', roadmap: 'Lộ trình', doneDays: 'Số ngày đã xong', scores: 'Điểm', errorCode: 'Mã lỗi', positionName: 'Tên vị trí', totalDays: 'Tổng ngày', provision: 'Khởi tạo', pendingSubmission: 'Lần nộp đang xử lý', lastSubmission: 'Mã lần nộp cuối', pendingAction: 'Thao tác đang chạy',
  kind: 'Loại', order: 'Thứ tự', parent: 'Cha', content: 'Nội dung', options: 'Lựa chọn', multiple: 'Nhiều đáp án', answers: 'Đáp án', explanation: 'Giải thích', attachments: 'Đính kèm', videos: 'Video', source: 'Nguồn', read: 'Đã đọc', selected: 'Trả lời', result: 'Kết quả', assignee: 'ASSIGNEE',
} as const;

export const V2_POSITION_FIELDS: readonly FieldSpec[] = [
  { name: V2.template, type: 'TEXT' }, { name: V2.weeks, type: 'NUMBER' }, { name: V2.days, type: 'NUMBER' },
  { name: V2.lessons, type: 'NUMBER' }, { name: V2.questions, type: 'NUMBER' }, { name: V2.missingAnswers, type: 'NUMBER' },
  { name: V2.inUse, type: 'NUMBER' }, { name: V2.importSource, type: 'TEXT' },
];

export const V2_HIRE_FIELDS: readonly FieldSpec[] = [
  { name: V2.employee, type: 'ASSIGNEE' }, { name: V2.position, type: 'TEXT' }, { name: V2.startDate, type: 'DATE' },
  { name: V2.roadmap, type: 'TEXT' }, { name: V2.doneDays, type: 'NUMBER' }, { name: V2.scores, type: 'TEXTAREA' },
  { name: V2.errorCode, type: 'TEXT' }, { name: V2.positionName, type: 'TEXT' }, { name: V2.totalDays, type: 'NUMBER' },
  { name: V2.provision, type: 'TEXTAREA' }, { name: V2.pendingSubmission, type: 'TEXTAREA' },
  { name: V2.lastSubmission, type: 'TEXT' }, { name: V2.pendingAction, type: 'TEXT' },
];

export const V2_TEMPLATE_FIELDS: readonly FieldSpec[] = [
  { name: V2.kind, type: 'SELECT', options: ['Tuần', 'Ngày', 'Bài học', 'Câu hỏi'] },
  { name: V2.order, type: 'NUMBER' }, { name: V2.parent, type: 'TEXT' }, { name: V2.content, type: 'TEXTAREA' },
  { name: V2.options, type: 'TEXTAREA' }, { name: V2.multiple, type: 'CHECKBOX' },
  { name: V2.answers, type: 'TEXT' }, { name: V2.explanation, type: 'TEXTAREA' },
  { name: V2.attachments, type: 'FILE_MULTIPLE' }, { name: V2.videos, type: 'TEXTAREA' },
  { name: V2.importSource, type: 'TEXT' },
];

export const V2_ROADMAP_FIELDS: readonly FieldSpec[] = [
  ...V2_TEMPLATE_FIELDS.filter((field) => field.name !== V2.importSource),
  { name: V2.source, type: 'TEXT' }, { name: V2.assignee, type: 'ASSIGNEE' },
  { name: V2.read, type: 'CHECKBOX' }, { name: V2.selected, type: 'TEXT' },
  { name: V2.result, type: 'SELECT', options: ['Đúng', 'Sai'] },
  { name: V2.startDate, type: 'DATE' }, { name: V2.template, type: 'TEXT' },
];

export type SelectLabels = Record<string, Record<string, string>>;

export function resolveSelectLabels(defs: readonly {
  _id?: string; id?: string;
  options?: readonly { _id?: string; id?: string; value: string }[];
}[]): SelectLabels {
  const labels: SelectLabels = {};
  for (const def of defs) {
    const fieldId = def._id ?? def.id;
    if (!fieldId || !def.options) continue;
    const options: Record<string, string> = {};
    for (const option of def.options) {
      const optionId = option._id ?? option.id;
      if (!optionId) continue;
      if (options[optionId] && options[optionId] !== option.value) throw new OnboardingError('SCHEMA_DRIFT', fieldId);
      options[optionId] = option.value;
    }
    labels[fieldId] = options;
  }
  return labels;
}

export function resolveV2FieldIds(defs: readonly (Pick<FieldDef, 'name' | 'type'> & { _id?: string; id?: string })[], specs: readonly FieldSpec[]): FieldIds {
  const ids: FieldIds = {};
  for (const spec of specs) {
    const def = defs.find((candidate) => candidate.name === spec.name);
    if (!def) {
      // A list with legacy names belongs to v1. Never silently upgrade it in place.
      const legacy = defs.some((candidate) => candidate.name === 'Hạn (ngày thứ N)' || candidate.name === 'Người thực hiện' || candidate.name === 'Tổng task');
      throw new OnboardingError(legacy || spec.name === V2.kind ? 'SCHEMA_MIGRATION_REQUIRED' : 'SCHEMA_DRIFT', spec.name);
    }
    if (def.type !== spec.type) throw new OnboardingError('SCHEMA_DRIFT', spec.name);
    const fieldId = def._id ?? def.id;
    if (!fieldId) throw new OnboardingError('SCHEMA_DRIFT', spec.name);
    ids[spec.name] = fieldId;
  }
  return ids;
}
