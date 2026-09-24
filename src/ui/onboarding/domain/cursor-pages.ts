export interface CursorPages { cursors: (string | undefined)[]; index: number }

export function resetPages(): CursorPages {
  return { cursors: [undefined], index: 0 };
}

export function nextPage(state: CursorPages, nextCursor: string | null): CursorPages {
  if (!nextCursor) return state;
  if (state.cursors[state.index + 1] === nextCursor) return { ...state, index: state.index + 1 };
  if (state.cursors.includes(nextCursor)) throw new Error('PAGINATION_INVALID');
  return { cursors: [...state.cursors.slice(0, state.index + 1), nextCursor], index: state.index + 1 };
}

export function previousPage(state: CursorPages): CursorPages {
  return state.index === 0 ? state : { cursors: state.cursors, index: state.index - 1 };
}

export function mergeUniqueItemsById<T extends { _id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map(existing.map((item) => [item._id, item]));
  for (const item of incoming) byId.set(item._id, item);
  return [...byId.values()];
}
