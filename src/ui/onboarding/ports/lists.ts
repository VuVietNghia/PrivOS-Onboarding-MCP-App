import type { FieldDef, FieldIds, FieldSpec, HubItem } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';

export interface HubList {
  _id: string;
  name: string;
  key?: string;
  isolatedList?: boolean;
  fieldDefinitions?: FieldDef[];
}

export interface CreateListInput {
  roomId: string;
  name: string;
  key: string;
  fields: FieldSpec[];
  stages: { name: string; color?: string; order?: number }[];
  isolated: boolean;
}

export interface CreateItemInput {
  listId: string;
  name: string;
  stageId: string;
  parentId?: string;
  description?: string;
  customFields: { fieldId: string; value: unknown }[];
}

export interface IsolatedListInfo {
  _id: string;
  name: string;
  roomId: string;
  isolatedList: boolean;
  fieldDefinitions: { _id: string; name: string; type: string; options?: { _id?: string; value: string }[] }[];
  stages: { _id: string; name: string; order: number }[];
}

export interface ItemQueryFilter {
  stageId?: string;
  parentId?: string | null;
  archived?: boolean;
  customFields?: readonly { fieldId: string; op: 'contains' | 'is'; value: string }[];
}

export interface ItemQuerySort {
  field: 'order' | 'createdAt' | '_updatedAt' | 'name';
  direction: 1 | -1;
}

export interface ListReadPort {
  listRoomLists(roomId: string): Promise<HubList[]>;
  registryLists(roomId: string): Promise<Array<{ _id: string; name: string; roomId: string; isolatedList: boolean }>>;
  isolatedInfo(listId: string): Promise<IsolatedListInfo>;
  getListInfo(listId: string): Promise<{ list: HubList; stages: StageRef[] }>;
  readListInfo(listId: string): Promise<{
    list: { _id: string; name: string; roomId: string; fieldDefinitions: FieldDef[] };
    stages: StageRef[];
  }>;
  queryItems(listId: string, filter: ItemQueryFilter, count: number, cursor?: string, sort?: ItemQuerySort): Promise<{ items: HubItem[]; nextCursor: string | null }>;
  readAllItems(listId: string): Promise<HubItem[]>;
  readItem(listId: string, itemId: string): Promise<HubItem>;
  listAllItems(listId: string): Promise<{ items: HubItem[]; capped: boolean }>;
}

export interface ListWritePort {
  createItem(input: CreateItemInput): Promise<HubItem>;
  updateItem(input: {
    itemId: string; name?: string; description?: string; stageId?: string;
    customFields?: { fieldId: string; value: unknown }[];
  }): Promise<void>;
  patchFields(listId: string, itemId: string, changes: Readonly<Record<string, unknown>>): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  moveItemToStage(itemId: string, stageId: string): Promise<void>;
}

export interface ListLifecyclePort {
  createList(input: CreateListInput): Promise<HubList>;
  createIsolatedList(input: CreateListInput): Promise<{ _id: string }>;
  renameList(listId: string, name: string): Promise<void>;
  deleteList(listId: string): Promise<boolean>;
}

export interface ListDiscovery {
  findHiresList(roomId: string): Promise<HubList | null>;
  ensureHiresList(roomId: string): Promise<HubList>;
  listTemplateLists(roomId: string): Promise<HubList[]>;
  createTemplateList(roomId: string, position: string, stageNames: string[]): Promise<HubList>;
  loadListWithFields(listId: string, specs: FieldSpec[]): Promise<{ list: HubList; stages: StageRef[]; ids: FieldIds }>;
}
