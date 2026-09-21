// src/ui/onboarding/domain/roles.ts
const ADMIN_ROLES = new Set(['owner', 'admin', 'moderator']);

export function isRoomAdmin(roles: readonly string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.has(r));
}
