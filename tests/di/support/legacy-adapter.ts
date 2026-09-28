import type { McpApp } from '@privos_ai/app-react';
import { createLifetime } from '../../../src/shared/lifetime';
import { createListDiscovery } from '../../../src/ui/onboarding/data/find-lists';
import { createPrivosLists } from '../../../src/ui/onboarding/data/privos/lists-adapter';
import type { LegacyDeps } from '../../../src/ui/onboarding/ports/legacy';

export function legacyDepsForApp(app: McpApp): LegacyDeps {
  const lists = createPrivosLists(app, {
    lifetime: createLifetime(),
    budget: { run: <T>(operation: () => Promise<T>) => operation(), dispose() {} },
  });
  return { ...lists, discovery: createListDiscovery(lists.read, lists.lifecycle) };
}
