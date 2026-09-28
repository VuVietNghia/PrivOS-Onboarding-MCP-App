import { expect, it } from 'vitest';
import { createPrivosHrGateway } from '../../src/ui/onboarding/data/privos/hr-gateway';
import { createListStub } from './support/list-stub';

it('checks room identity before reading a hire record', async () => {
  const lists = createListStub();
  lists.read.readListInfo.mockResolvedValue({
    list: { _id: 'hires', name: 'Hires', roomId: 'other-room', fieldDefinitions: [] }, stages: [],
  });
  const gateway = createPrivosHrGateway({
    ...lists, binding: { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' },
  });
  await expect(gateway.readHire('hire-1')).rejects.toThrow('ROOM_MISMATCH');
  expect(lists.write.patchFields).not.toHaveBeenCalled();
});
