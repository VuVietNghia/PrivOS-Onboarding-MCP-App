export function probeIdentityKey(roomId: string, userId?: string): string {
  return JSON.stringify([roomId, userId ?? null]);
}

export function probeSurfaceKey(roomId: string, userId: string | undefined, admin: boolean): string {
  return JSON.stringify([roomId, userId ?? null, admin]);
}
