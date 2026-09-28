import type { McpApp } from '@privos_ai/app-react';
import { createLifetime } from '../../../../shared/lifetime';
import { createBrowserEffects } from '../../../adapters/browser-effects';
import type { RoomBinding } from '../../domain/models';
import type { Catalogs } from '../../ports/catalogs';
import { createCatalogs } from '../catalogs';
import { createRequestBudget } from '../request-budget';
import { createPrivosBudgetEffects } from './budget-effects';
import { createPrivosLists } from './lists-adapter';

export function createPrivosCatalogs(app: McpApp, binding: RoomBinding): Catalogs {
  const effects = createBrowserEffects();
  const lists = createPrivosLists(app, {
    lifetime: createLifetime(),
    budget: createRequestBudget(createPrivosBudgetEffects(effects.clock, effects.scheduler)),
  });
  return createCatalogs({ binding, read: lists.read });
}
