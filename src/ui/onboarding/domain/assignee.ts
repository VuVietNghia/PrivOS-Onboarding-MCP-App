/**
 * Mirror the Hub's `getAssignedUserIds` parsing of an ASSIGNEE field value: a bare-id string,
 * a `{ _id }` object, or an array of either. Returns deduped user ids.
 */
export function normalizeAssignedUserIds(value: unknown): string[] {
  const toId = (entry: unknown): string | null => {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (entry && typeof entry === 'object' && typeof (entry as { _id?: unknown })._id === 'string') {
      return (entry as { _id: string })._id;
    }
    return null;
  };
  const entries: unknown[] = Array.isArray(value) ? value : [value];
  const ids = entries.map(toId).filter((id): id is string => id !== null);
  return Array.from(new Set(ids));
}
