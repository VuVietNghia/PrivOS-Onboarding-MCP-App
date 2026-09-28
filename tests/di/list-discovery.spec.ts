import { expect, it, vi } from 'vitest';
import { createListDiscovery } from '../../src/ui/onboarding/data/find-lists';
import type { HubList } from '../../src/ui/onboarding/ports/lists';

it('reuses an existing hires list instead of creating a duplicate', async () => {
  const existing: HubList = { _id: 'hires-1', name: 'Onboarding · Nhân sự', key: 'onb-hires' };
  const listRoomLists = vi.fn(async (_roomId: string) => [existing]);
  const createList = vi.fn();
  const discovery = createListDiscovery(
    { listRoomLists, getListInfo: vi.fn(async () => { throw new Error('UNEXPECTED_INFO_READ'); }) },
    { createList },
  );
  await expect(discovery.ensureHiresList('room-1')).resolves.toEqual(existing);
  expect(listRoomLists).toHaveBeenCalledWith('room-1');
  expect(createList).not.toHaveBeenCalled();
});
