import type { Hire } from './schemas';

/**
 * Human label for a hire record. The record stores the hire's user id (item name, and ASSIGNEE once
 * provisioning finishes); the room member list, when available, turns that id into a display name.
 */
export function hireLabel(hire: Pick<Hire, 'name' | 'employeeIds'>, names: ReadonlyMap<string, string>): string {
  const userId = hire.employeeIds[0] ?? hire.name;
  if (!userId) return '—';
  return names.get(userId) ?? userId;
}
