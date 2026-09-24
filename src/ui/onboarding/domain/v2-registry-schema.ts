import type { CreateListInput } from '../data/onboarding-lists';
import type { FieldSpec } from './fields';

type RegistryKind = 'positions' | 'hires';

const schemas: Record<RegistryKind, { name: string; key: string; stages: readonly string[]; fields: readonly FieldSpec[] }> = {
  positions: {
    name: 'Onboarding positions', key: 'onb-positions',
    stages: ['Đang soạn', 'Sẵn sàng', 'Ngừng dùng'],
    fields: [
      { name: 'Template', type: 'TEXT' }, { name: 'Số tuần', type: 'NUMBER' },
      { name: 'Số ngày', type: 'NUMBER' }, { name: 'Số bài học', type: 'NUMBER' },
      { name: 'Số câu hỏi', type: 'NUMBER' }, { name: 'Thiếu đáp án', type: 'NUMBER' },
      { name: 'Đang dùng', type: 'NUMBER' }, { name: 'Nguồn nhập', type: 'TEXT' },
    ],
  },
  hires: {
    name: 'Onboarding hires', key: 'onb-hires',
    stages: ['Đang khởi tạo', 'Đang học', 'Hoàn tất', 'Khởi tạo lỗi', 'Đã huỷ'],
    fields: [
      { name: 'Nhân sự', type: 'ASSIGNEE' }, { name: 'Vị trí', type: 'TEXT' },
      { name: 'Ngày bắt đầu', type: 'DATE' }, { name: 'Lộ trình', type: 'TEXT' },
      { name: 'Số ngày đã xong', type: 'NUMBER' }, { name: 'Điểm', type: 'TEXTAREA' },
      { name: 'Mã lỗi', type: 'TEXT' }, { name: 'Tên vị trí', type: 'TEXT' },
      { name: 'Tổng ngày', type: 'NUMBER' }, { name: 'Khởi tạo', type: 'TEXTAREA' },
      { name: 'Lần nộp đang xử lý', type: 'TEXTAREA' }, { name: 'Mã lần nộp cuối', type: 'TEXT' },
      { name: 'Thao tác đang chạy', type: 'TEXT' },
    ],
  },
};

export function registryListInput(roomId: string, kind: RegistryKind): CreateListInput {
  const schema = schemas[kind];
  return { roomId, name: schema.name, key: schema.key, isolated: true,
    stages: schema.stages.map((name, order) => ({ name, order, color: ['#64748b', '#2563eb', '#16a34a', '#dc2626', '#94a3b8'][order] })),
    fields: schema.fields.map((field) => ({ ...field })),
  };
}
