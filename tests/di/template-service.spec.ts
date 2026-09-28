import { expect, it } from 'vitest';
import { createTemplateService } from '../../src/ui/onboarding/flows/save-template-v4';
import { createListStub } from './support/list-stub';

it('propagates registry failure before creating data', async () => {
  const lists = createListStub();
  lists.read.isolatedInfo.mockRejectedValue(new Error('REGISTRY_DENIED'));
  const service = createTemplateService({
    ...lists, binding: { roomId: 'room', positionsListId: 'positions', hiresListId: 'hires' },
    ids: { next: () => 'fixed-template-id' },
  });
  await expect(service.save({
    name: 'Engineer', status: 'draft',
    tree: { weeks: [{ id: 'draft:week', name: 'Week 1', order: 0 }], items: [] },
  })).rejects.toThrow('REGISTRY_DENIED');
  expect(lists.read.isolatedInfo).toHaveBeenCalledWith('positions');
  expect(lists.lifecycle.createIsolatedList).not.toHaveBeenCalled();
});
