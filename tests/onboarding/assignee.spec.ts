import { describe, expect, it } from 'vitest';
import { normalizeAssignedUserIds } from '../../src/ui/onboarding/domain/assignee';

describe('normalizeAssignedUserIds', () => {
  it('nhận mảng id dạng chuỗi', () => {
    expect(normalizeAssignedUserIds(['user-1', 'user-2'])).toEqual(['user-1', 'user-2']);
  });
  it('nhận mảng object { _id }', () => {
    expect(normalizeAssignedUserIds([{ _id: 'user-1' }, { _id: 'user-2' }])).toEqual(['user-1', 'user-2']);
  });
  it('nhận mảng trộn chuỗi và object', () => {
    expect(normalizeAssignedUserIds(['user-1', { _id: 'user-2' }])).toEqual(['user-1', 'user-2']);
  });
  it('nhận một chuỗi đơn', () => {
    expect(normalizeAssignedUserIds('user-1')).toEqual(['user-1']);
  });
  it('nhận một object { _id } đơn', () => {
    expect(normalizeAssignedUserIds({ _id: 'user-1' })).toEqual(['user-1']);
  });
  it('bỏ phần tử không có id và khử trùng', () => {
    expect(normalizeAssignedUserIds(['user-1', {}, null, 'user-1', 42])).toEqual(['user-1']);
  });
  it('trả mảng rỗng với null/undefined', () => {
    expect(normalizeAssignedUserIds(null)).toEqual([]);
    expect(normalizeAssignedUserIds(undefined)).toEqual([]);
  });
});
