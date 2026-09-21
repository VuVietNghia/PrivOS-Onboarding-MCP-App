// tests/onboarding/progress.spec.ts
import { describe, expect, it } from 'vitest';
import { canToggle, computeProgress, groupByStage, taskBadge } from '../../src/ui/onboarding/domain/progress';
import type { RoadmapTask } from '../../src/ui/onboarding/domain/schemas';

const base: RoadmapTask = { id: 'x', name: 'x', stageId: 's0', parentId: 'root', dayOffset: 0, owner: 'Nhân sự', assigneeIds: ['u1'], deadline: '2026-09-21', done: false, sourceId: null };
const root: RoadmapTask = { ...base, id: 'root', parentId: null };

describe('computeProgress', () => {
  it('đếm task con, bỏ item gốc, tính quá hạn và deadline gần nhất', () => {
    const tasks: RoadmapTask[] = [
      root,
      { ...base, id: 'a', done: true, deadline: '2026-09-18' },
      { ...base, id: 'b', deadline: '2026-09-18' },
      { ...base, id: 'c', deadline: '2026-09-30' },
    ];
    expect(computeProgress(tasks, '2026-09-21')).toEqual({ done: 1, total: 3, percent: 33, overdue: 1, nextDeadline: '2026-09-30' });
  });
  it('không có task thì percent 0', () => {
    expect(computeProgress([root], '2026-09-21')).toEqual({ done: 0, total: 0, percent: 0, overdue: 0, nextDeadline: null });
  });
  it('item gốc có parentId: null không được đếm vào total', () => {
    const tasks: RoadmapTask[] = [
      root,
      { ...base, id: 'a', deadline: '2026-09-22' },
      { ...base, id: 'b', deadline: '2026-09-23' },
    ];
    const progress = computeProgress(tasks, '2026-09-21');
    expect(progress.total).toBe(2);
  });
});

describe('taskBadge', () => {
  it('done thắng mọi nhãn', () => expect(taskBadge({ ...base, done: true, deadline: '2020-01-01' }, '2026-09-21')).toBe('done'));
  it('overdue khi deadline trước hôm nay', () => expect(taskBadge({ ...base, deadline: '2026-09-18' }, '2026-09-21')).toBe('overdue'));
  it('dueSoon khi còn tối đa 2 ngày làm việc', () => {
    expect(taskBadge({ ...base, deadline: '2026-09-23' }, '2026-09-21')).toBe('dueSoon');
    expect(taskBadge({ ...base, deadline: '2026-09-24' }, '2026-09-21')).toBe(null);
  });
  it('task HR chưa tới hạn thì nhãn hr', () => expect(taskBadge({ ...base, owner: 'HR', deadline: '2026-10-10' }, '2026-09-21')).toBe('hr'));
});

describe('groupByStage', () => {
  it('nhóm theo order stage, sắp task theo deadline rồi tên', () => {
    const stages = [{ _id: 's1', name: 'Tuần 1', order: 1 }, { _id: 's0', name: 'Ngày đầu', order: 0 }];
    const g = groupByStage([
      { ...base, id: 'b', name: 'B', stageId: 's0', deadline: '2026-09-22' },
      { ...base, id: 'a', name: 'A', stageId: 's0', deadline: '2026-09-22' },
      { ...base, id: 'c', name: 'C', stageId: 's1', deadline: '2026-09-25' },
      root,
    ], stages);
    expect(g.map((x) => x.stage._id)).toEqual(['s0', 's1']);
    expect(g[0].tasks.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('canToggle', () => {
  it('admin tick mọi task, nhân sự chỉ tick task được gán', () => {
    expect(canToggle({ ...base, owner: 'HR', assigneeIds: [] }, 'u1', true)).toBe(true);
    expect(canToggle({ ...base, owner: 'HR', assigneeIds: [] }, 'u1', false)).toBe(false);
    expect(canToggle(base, 'u1', false)).toBe(true);
    expect(canToggle(base, 'u2', false)).toBe(false);
  });
});
