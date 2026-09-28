import { expect, it } from 'vitest';
import { createListDiscovery } from '../../src/ui/onboarding/data/find-lists';
import { createLegacyServices } from '../../src/ui/onboarding/flows/legacy-services';
import { createListStub } from './support/list-stub';

it('rejects an unauthorized legacy provision before any list write', async () => {
  const lists = createListStub();
  const services = createLegacyServices({
    ...lists,
    discovery: createListDiscovery(lists.read, lists.lifecycle),
  });
  await expect(services.provisionRoadmap({
    roomId: 'R', employeeId: 'U', templateListId: 'T', startDate: '2026-09-25', userRoles: ['member'],
  })).rejects.toThrow('NOT_ADMIN');
  expect(lists.write.createItem).not.toHaveBeenCalled();
  expect(lists.lifecycle.createList).not.toHaveBeenCalled();
});
