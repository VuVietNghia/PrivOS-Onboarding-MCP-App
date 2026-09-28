import { vi } from 'vitest';
import type { ListLifecyclePort, ListReadPort, ListWritePort } from '../../../src/ui/onboarding/ports/lists';

const fail = new Error('UNEXPECTED_PORT_CALL');

export function createListStub() {
  const read = {
    listRoomLists: vi.fn<ListReadPort['listRoomLists']>().mockRejectedValue(fail),
    registryLists: vi.fn<ListReadPort['registryLists']>().mockRejectedValue(fail),
    isolatedInfo: vi.fn<ListReadPort['isolatedInfo']>().mockRejectedValue(fail),
    getListInfo: vi.fn<ListReadPort['getListInfo']>().mockRejectedValue(fail),
    readListInfo: vi.fn<ListReadPort['readListInfo']>().mockRejectedValue(fail),
    queryItems: vi.fn<ListReadPort['queryItems']>().mockRejectedValue(fail),
    readAllItems: vi.fn<ListReadPort['readAllItems']>().mockRejectedValue(fail),
    readItem: vi.fn<ListReadPort['readItem']>().mockRejectedValue(fail),
    listAllItems: vi.fn<ListReadPort['listAllItems']>().mockRejectedValue(fail),
  } satisfies ListReadPort;
  const write = {
    createItem: vi.fn<ListWritePort['createItem']>().mockRejectedValue(fail),
    updateItem: vi.fn<ListWritePort['updateItem']>().mockRejectedValue(fail),
    patchFields: vi.fn<ListWritePort['patchFields']>().mockRejectedValue(fail),
    deleteItem: vi.fn<ListWritePort['deleteItem']>().mockRejectedValue(fail),
    moveItemToStage: vi.fn<ListWritePort['moveItemToStage']>().mockRejectedValue(fail),
  } satisfies ListWritePort;
  const lifecycle = {
    createList: vi.fn<ListLifecyclePort['createList']>().mockRejectedValue(fail),
    createIsolatedList: vi.fn<ListLifecyclePort['createIsolatedList']>().mockRejectedValue(fail),
    renameList: vi.fn<ListLifecyclePort['renameList']>().mockRejectedValue(fail),
    deleteList: vi.fn<ListLifecyclePort['deleteList']>().mockRejectedValue(fail),
  } satisfies ListLifecyclePort;
  return { read, write, lifecycle };
}
