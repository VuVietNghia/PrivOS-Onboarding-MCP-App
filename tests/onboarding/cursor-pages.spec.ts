import { describe, expect, it } from 'vitest';
import { mergeUniqueItemsById, nextPage, previousPage, resetPages } from '../../src/ui/onboarding/domain/cursor-pages';

describe('cursor page navigation', () => {
  it('starts at the first page and returns to it while retaining forward navigation', () => {
    const first = resetPages();
    expect(first).toEqual({ cursors: [undefined], index: 0 });
    const second = nextPage(first, 'cursor-2');
    expect(second).toEqual({ cursors: [undefined, 'cursor-2'], index: 1 });
    expect(previousPage(second)).toEqual({ cursors: [undefined, 'cursor-2'], index: 0 });
  });

  it('does not advance past the last page or accept a repeated cursor', () => {
    const second = nextPage(resetPages(), 'cursor-2');
    expect(nextPage(second, null)).toEqual(second);
    expect(() => nextPage(second, 'cursor-2')).toThrow('PAGINATION_INVALID');
  });

  it('replaces stale forward history after navigating backward and filter reset starts over', () => {
    const second = nextPage(resetPages(), 'cursor-2');
    const third = nextPage(second, 'cursor-3');
    expect(nextPage(previousPage(third), 'cursor-3')).toEqual(third);
    const revised = nextPage(previousPage(third), 'cursor-2-new');
    expect(revised).toEqual({ cursors: [undefined, 'cursor-2', 'cursor-2-new'], index: 2 });
    expect(resetPages()).toEqual({ cursors: [undefined], index: 0 });
  });

  it('merges pages by item ID while retaining the latest item contents', () => {
    expect(mergeUniqueItemsById(
      [{ _id: 'a', name: 'old' }, { _id: 'b', name: 'B' }],
      [{ _id: 'a', name: 'new' }, { _id: 'c', name: 'C' }],
    )).toEqual([{ _id: 'a', name: 'new' }, { _id: 'b', name: 'B' }, { _id: 'c', name: 'C' }]);
  });
});
