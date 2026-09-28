import { expect, it, vi } from 'vitest';
import { createCatalogs } from '../../src/ui/onboarding/data/catalogs';
import { resolveRoomBinding } from '../../src/ui/onboarding/data/room-bootstrap';
import type { ActorSession } from '../../src/ui/onboarding/ports/session';

const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };

it('propagates a registry read failure before catalog query', async () => {
  const readListInfo = vi.fn(async (_listId: string): Promise<never> => { throw new Error('REGISTRY_DENIED'); });
  const queryItems = vi.fn();
  const catalogs = createCatalogs({ binding, read: {
    readListInfo, queryItems, readAllItems: vi.fn(), readItem: vi.fn(),
  } });
  await expect(catalogs.positions({ text: '' })).rejects.toThrow('REGISTRY_DENIED');
  expect(readListInfo).toHaveBeenCalledWith('positions-1');
  expect(queryItems).not.toHaveBeenCalled();
});

it('does not create registries or read positions for a member without hires', async () => {
  const actor: ActorSession = {
    roomId: 'room-1', roomType: 'c', userId: 'employee-1', roles: ['member'], grantedScopes: [],
  };
  const registryLists = vi.fn(async (_roomId: string) => []);
  const isolatedInfo = vi.fn();
  const createIsolatedList = vi.fn();
  const result = await resolveRoomBinding({
    read: { registryLists, isolatedInfo }, lifecycle: { createIsolatedList },
  }, actor);
  expect(result).toEqual({ state: 'needs-admin' });
  expect(registryLists).toHaveBeenCalledWith('room-1');
  expect(isolatedInfo).not.toHaveBeenCalled();
  expect(createIsolatedList).not.toHaveBeenCalled();
});
