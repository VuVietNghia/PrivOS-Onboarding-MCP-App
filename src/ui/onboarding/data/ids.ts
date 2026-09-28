export function idOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  const id = object._id ?? object.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}
