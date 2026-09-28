import type { McpApp } from '@privos_ai/app-react';
import { createLifetime } from '../../../../shared/lifetime';
import type { FieldSpec } from '../../domain/fields';
import { createListDiscovery } from '../find-lists';
import { createPrivosLists } from './lists-adapter';

function discovery(app: McpApp) {
  const ports = createPrivosLists(app, {
    lifetime: createLifetime(),
    budget: { run: operation => operation(), dispose() {} },
  });
  return createListDiscovery(ports.read, ports.lifecycle);
}

export const findHiresList = (app: McpApp, roomId: string) => discovery(app).findHiresList(roomId);
export const ensureHiresList = (app: McpApp, roomId: string) => discovery(app).ensureHiresList(roomId);
export const listTemplateLists = (app: McpApp, roomId: string) => discovery(app).listTemplateLists(roomId);
export const createTemplateList = (app: McpApp, roomId: string, position: string, stageNames: string[]) =>
  discovery(app).createTemplateList(roomId, position, stageNames);
export const loadListWithFields = (app: McpApp, listId: string, specs: FieldSpec[]) =>
  discovery(app).loadListWithFields(listId, specs);
