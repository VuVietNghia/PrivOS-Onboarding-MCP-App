import type { IdGenerator } from '../../../shared/ports/effects';
import type { RoomBinding, TemplateTree } from '../domain/models';
import type { ListLifecyclePort, ListReadPort, ListWritePort } from './lists';

export interface TemplateDeps {
  binding: RoomBinding;
  read: Pick<ListReadPort, 'isolatedInfo' | 'readAllItems' | 'readItem' | 'listRoomLists'>;
  write: Pick<ListWritePort, 'createItem' | 'updateItem' | 'deleteItem' | 'moveItemToStage'>;
  lifecycle: Pick<ListLifecyclePort, 'createIsolatedList'>;
  ids: IdGenerator;
}

export interface SaveTemplateV4Input {
  positionId?: string;
  tree: TemplateTree;
  name: string;
  status: 'draft' | 'ready';
  importSource?: string;
  templateKey?: string;
}

export interface TemplateService {
  save(input: SaveTemplateV4Input): Promise<string>;
}
