import type { McpApp } from '@privos_ai/app-react';
import { createLifetime } from '../../../../shared/lifetime';
import { createKeyedLock } from '../../../../shared/keyed-lock';
import { createBrowserEffects } from '../../../adapters/browser-effects';
import { createCatalogs } from '../catalogs';
import { createRequestBudget } from '../request-budget';
import { createPrivosBudgetEffects } from './budget-effects';
import { createPrivosHrGateway } from './hr-gateway';
import { createPrivosImportGateway } from './import-gateway';
import { createPrivosLists } from './lists-adapter';
import type { Catalogs } from '../../ports/catalogs';
import type { RoomBinding } from '../../domain/models';
import type { SaveTemplateV4Input } from '../../ports/template';
import type { PreparedProvisionV4, ProvisionOutcome, ProvisionProgress } from '../../ports/provision';
import type { LearningService } from '../../ports/learning';
import type { HrV4Gateway } from '../../ports/hr';
import type { ImportV4Gateway } from '../../ports/import';
import { createTemplateService } from '../../flows/save-template-v4';
import { createProvisionService } from '../../flows/provision-v4';
import { createLearningService } from '../../flows/learning-v4';

function listsFor(app: McpApp) {
  const effects = createBrowserEffects();
  return createPrivosLists(app, { lifetime: createLifetime(), budget: createRequestBudget(createPrivosBudgetEffects(effects.clock, effects.scheduler)) });
}

export function saveTemplateV4(app: McpApp, binding: RoomBinding, input: SaveTemplateV4Input): Promise<string> {
  return createTemplateService({ ...listsFor(app), binding, ids: createBrowserEffects().ids }).save(input);
}

function provisionFor(app: McpApp, binding: RoomBinding, roles: readonly string[], catalogs?: Pick<Catalogs, 'position' | 'template' | 'hires'>) {
  const lists = listsFor(app);
  return createProvisionService({ ...lists, binding,
    catalogs: catalogs ?? createCatalogs({ binding, read: lists.read }),
    actor: { roomId: binding.roomId, roomType: 'c', userId: '', roles, grantedScopes: [] },
    hasher: createBrowserEffects().hasher,
  });
}

export function provisionV4(app: McpApp, binding: RoomBinding, prepared: PreparedProvisionV4,
  roles: readonly string[], onProgress?: (progress: ProvisionProgress) => void, catalogs?: Pick<Catalogs, 'position' | 'template' | 'hires'>): Promise<ProvisionOutcome> {
  return provisionFor(app, binding, roles, catalogs).start(prepared, onProgress);
}

export function resumeV4(app: McpApp, binding: RoomBinding, hireId: string, prepared: PreparedProvisionV4,
  roles: readonly string[], onProgress?: (progress: ProvisionProgress) => void, catalogs?: Pick<Catalogs, 'position' | 'template' | 'hires'>): Promise<ProvisionOutcome> {
  return provisionFor(app, binding, roles, catalogs).resume(hireId, prepared, onProgress);
}

export function recountPositionV4(app: McpApp, binding: RoomBinding, positionId: string): Promise<number> {
  return provisionFor(app, binding, ['admin']).recount(positionId);
}

export function createMcpLearningCompat(app: McpApp, binding: RoomBinding, userId: string): LearningService {
  const lock = createKeyedLock(createLifetime());
  return createLearningService({ ...listsFor(app), binding,
    actor: { roomId: binding.roomId, roomType: 'c', userId, roles: [], grantedScopes: [] }, lock });
}

export function createMcpHrV4Gateway(app: McpApp, binding: RoomBinding): HrV4Gateway {
  return createPrivosHrGateway({ ...listsFor(app), binding });
}

export function createMcpImportV4Gateway(app: McpApp, binding: RoomBinding): ImportV4Gateway {
  const lists = listsFor(app);
  const templates = createTemplateService({ ...lists, binding, ids: createBrowserEffects().ids });
  return createPrivosImportGateway({ binding, read: lists.read, templates });
}
