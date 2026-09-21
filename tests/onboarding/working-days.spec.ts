import { describe, expect, it } from 'vitest';
import { addWorkingDays, isWorkingDay, workingDaysUntil, isValidIsoDate } from '../../src/ui/onboarding/domain/working-days';

describe('working-days', () => {
  it('isWorkingDay: T2-T6 true, T7/CN false', () => {
    expect(isWorkingDay('2026-09-21')).toBe(true);  // thứ 2
    expect(isWorkingDay('2026-09-25')).toBe(true);  // thứ 6
    expect(isWorkingDay('2026-09-26')).toBe(false); // thứ 7
    expect(isWorkingDay('2026-09-27')).toBe(false); // chủ nhật
  });

  it('addWorkingDays: N=0 trả về chính ngày bắt đầu', () => {
    expect(addWorkingDays('2026-09-21', 0)).toBe('2026-09-21');
  });

  it('addWorkingDays: bắt đầu thứ 6, +1 là thứ 2 tuần sau', () => {
    expect(addWorkingDays('2026-09-25', 1)).toBe('2026-09-28');
  });

  it('addWorkingDays: +10 ngày làm việc từ thứ 2 là thứ 2 hai tuần sau', () => {
    expect(addWorkingDays('2026-09-21', 10)).toBe('2026-10-05');
  });

  it('addWorkingDays: ném lỗi nếu ngày bắt đầu là cuối tuần', () => {
    expect(() => addWorkingDays('2026-09-26', 1)).toThrow('START_NOT_WORKING_DAY');
  });

  it('workingDaysUntil: đếm ngày làm việc, bỏ cuối tuần, âm khi ngược', () => {
    expect(workingDaysUntil('2026-09-25', '2026-09-28')).toBe(1);
    expect(workingDaysUntil('2026-09-21', '2026-09-21')).toBe(0);
    expect(workingDaysUntil('2026-09-28', '2026-09-25')).toBe(-1);
  });

  it('isValidIsoDate: true for valid, false for invalid dates', () => {
    expect(isValidIsoDate('2026-09-21')).toBe(true);
    expect(isValidIsoDate('2026-13-45')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('hôm qua')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('isWorkingDay: false for invalid dates', () => {
    expect(isWorkingDay('2026-13-45')).toBe(false);
    expect(isWorkingDay('')).toBe(false);
  });

  it('addWorkingDays: ném INVALID_DATE khi ngày bắt đầu không hợp lệ', () => {
    expect(() => addWorkingDays('2026-13-45', 1)).toThrow('INVALID_DATE');
  });

  it('addWorkingDays: ném NEGATIVE_WORKING_DAYS khi n < 0', () => {
    expect(() => addWorkingDays('2026-09-21', -1)).toThrow('NEGATIVE_WORKING_DAYS');
  });

  it('workingDaysUntil: ném INVALID_DATE khi một trong hai ngày không hợp lệ', () => {
    expect(() => workingDaysUntil('2026-09-21', 'hôm qua')).toThrow('INVALID_DATE');
  });
});
