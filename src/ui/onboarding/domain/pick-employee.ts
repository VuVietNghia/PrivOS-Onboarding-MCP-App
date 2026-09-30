export interface RoomMember { id: string; username: string; name: string }

export type LookupResult =
  | { kind: 'found'; member: RoomMember }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

/**
 * Decide which user id to onboard from what HR typed when no member dropdown was available.
 * A username the Hub knows wins; an unknown username is refused; only when the lookup itself is
 * unavailable (no `users:read`) is the typed value taken as a raw user id.
 */
export type PickEmployeeResult =
  | { ok: true; employeeId: string }
  | { ok: false; code: 'EMPLOYEE_REQUIRED' | 'EMPLOYEE_NOT_FOUND'; message: string };

export function pickEmployee(input: string, lookup: LookupResult): PickEmployeeResult {
  const value = input.trim();
  if (!value) return { ok: false, code: 'EMPLOYEE_REQUIRED', message: 'Chọn hoặc nhập nhân sự.' };
  switch (lookup.kind) {
    case 'found':
      return { ok: true, employeeId: lookup.member.id };
    case 'not-found':
      return { ok: false, code: 'EMPLOYEE_NOT_FOUND', message: `Không tìm thấy người dùng "${value}".` };
    case 'unavailable':
      return { ok: true, employeeId: value };
  }
}
