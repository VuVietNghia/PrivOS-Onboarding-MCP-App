import { describe, expect, it } from 'vitest';
import { buildRoadmapPlan, mapStagesByOrder } from '../../src/ui/onboarding/domain/roadmap-plan';

const stages = [{ _id: 's-b', name: 'Tuần 1', order: 1 }, { _id: 's-a', name: 'Ngày đầu', order: 0 }];
const tasks = [
  { id: 't1', name: 'Ký hợp đồng', stageId: 's-a', dayOffset: 0, owner: 'Nhân sự' as const },
  { id: 't2', name: 'Cấp laptop', stageId: 's-a', dayOffset: 1, owner: 'HR' as const },
  { id: 't3', name: 'Gặp team', stageId: 's-b', dayOffset: 5, owner: 'Nhân sự' as const },
];

describe('buildRoadmapPlan', () => {
  const plan = buildRoadmapPlan({ templateStages: stages, templateTasks: tasks, startDate: '2026-09-25', employeeId: 'u1' });

  it('stage sắp theo order và giữ tên', () => {
    expect(plan.stages).toEqual([{ name: 'Ngày đầu', order: 0 }, { name: 'Tuần 1', order: 1 }]);
  });

  it('deadline tính theo ngày làm việc từ thứ 6', () => {
    expect(plan.tasks.map((t) => t.deadline)).toEqual(['2026-09-25', '2026-09-28', '2026-10-02']);
  });

  it('task của nhân sự gán ASSIGNEE, task HR để trống', () => {
    expect(plan.tasks[0].assigneeIds).toEqual(['u1']);
    expect(plan.tasks[1].assigneeIds).toEqual([]);
  });

  it('giữ templateTaskId và stageOrder', () => {
    expect(plan.tasks.map((t) => [t.templateTaskId, t.stageOrder])).toEqual([['t1', 0], ['t2', 0], ['t3', 1]]);
  });

  it('task trỏ stage không tồn tại thì ném lỗi', () => {
    expect(() => buildRoadmapPlan({ templateStages: stages, templateTasks: [{ ...tasks[0], stageId: 'ghost' }], startDate: '2026-09-25', employeeId: 'u1' }))
      .toThrow('TEMPLATE_STAGE_MISSING');
  });
});

describe('mapStagesByOrder', () => {
  it('map order sang stageId list mới, lỗi khi thiếu', () => {
    const m = mapStagesByOrder([{ order: 0 }, { order: 1 }], [{ _id: 'n1', name: 'x', order: 1 }, { _id: 'n0', name: 'y', order: 0 }]);
    expect(m.get(0)).toBe('n0');
    expect(m.get(1)).toBe('n1');
    expect(() => mapStagesByOrder([{ order: 2 }], [])).toThrow('RUN_STAGE_MISSING');
  });

  it('khớp theo giá trị order chứ không theo vị trí', () => {
    const m = mapStagesByOrder([{ order: 0 }, { order: 1 }], [{ _id: 'a', name: 'x', order: 5 }, { _id: 'b', name: 'y', order: 0 }, { _id: 'c', name: 'z', order: 1 }]);
    expect(m.get(0)).toBe('b');
    expect(m.get(1)).toBe('c');
  });

  it('nhánh dự phòng khi stage không có order', () => {
    const m = mapStagesByOrder([{ order: 0 }, { order: 1 }], [{ _id: 'p', name: 'x' }, { _id: 'q', name: 'y' }]);
    expect(m.get(0)).toBe('p');
    expect(m.get(1)).toBe('q');
  });
});
