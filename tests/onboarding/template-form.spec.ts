// tests/onboarding/template-form.spec.ts
import { describe, expect, it } from 'vitest';
import { parseStageNames, taskFormSchema } from '../../src/ui/onboarding/views/template-form';

describe('template-form', () => {
  it('parseStageNames tách dòng, bỏ trống và trùng', () => {
    expect(parseStageNames('Ngày đầu\n\n Tuần 1 \nNgày đầu')).toEqual(['Ngày đầu', 'Tuần 1']);
  });
  it('taskFormSchema ép dayOffset về số nguyên không âm', () => {
    expect(taskFormSchema.safeParse({ name: 'x', dayOffset: '3', owner: 'HR', stageId: 's' }).success).toBe(true);
    expect(taskFormSchema.safeParse({ name: 'x', dayOffset: '-1', owner: 'HR', stageId: 's' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ name: '', dayOffset: '0', owner: 'Nhân sự', stageId: 's' }).success).toBe(false);
  });
  it('ô Hạn để trống bị từ chối kèm thông báo, KHÔNG âm thầm thành D+0', () => {
    for (const blank of ['', '   ', Number.NaN, undefined, null]) {
      const r = taskFormSchema.safeParse({ name: 'x', dayOffset: blank, owner: 'HR', stageId: 's' });
      expect(r.success, `dayOffset=${String(blank)}`).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe('Nhập hạn: số ngày làm việc (0 trở lên).');
    }
  });
  it('0 nhập thật vẫn hợp lệ', () => {
    const r = taskFormSchema.safeParse({ name: 'x', dayOffset: '0', owner: 'HR', stageId: 's' });
    expect(r.success && r.data.dayOffset).toBe(0);
  });
  it('số lẻ bị từ chối', () => {
    expect(taskFormSchema.safeParse({ name: 'x', dayOffset: '1.5', owner: 'HR', stageId: 's' }).success).toBe(false);
  });
});
