import { expect, it } from 'vitest';
import { createPrivosImportGateway } from '../../src/ui/onboarding/data/privos/import-gateway';
import { createListStub } from './support/list-stub';

it('rejects a registry from another room before source queries', async () => {
  const lists = createListStub();
  lists.read.readListInfo.mockResolvedValue({
    list: { _id: 'positions', name: 'Positions', roomId: 'other-room', fieldDefinitions: [] }, stages: [],
  });
  const gateway = createPrivosImportGateway({
    binding: { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' }, read: lists.read,
    templates: { save: async () => { throw new Error('UNEXPECTED_SAVE'); } },
  });
  await expect(gateway.findPositionsBySource('Engineering')).rejects.toThrow('ROOM_MISMATCH');
  expect(lists.read.queryItems).not.toHaveBeenCalled();
});
