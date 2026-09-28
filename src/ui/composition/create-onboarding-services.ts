import type { Clock, Hasher, IdGenerator, KeyedLock, Lifetime, Preferences, Scheduler } from '../../shared/ports/effects';
import { createCatalogs } from '../onboarding/data/catalogs';
import { createListDiscovery } from '../onboarding/data/find-lists';
import { createPrivosHrGateway } from '../onboarding/data/privos/hr-gateway';
import { createPrivosImportGateway } from '../onboarding/data/privos/import-gateway';
import type { RoomBootstrap } from '../onboarding/ports/bootstrap';
import type { RoomBinding } from '../onboarding/domain/models';
import { createHrV4Actions } from '../onboarding/flows/hr-v4';
import { createImportService } from '../onboarding/flows/import-v4';
import { createLearningService } from '../onboarding/flows/learning-v4';
import { createLegacyServices } from '../onboarding/flows/legacy-services';
import { createProvisionService } from '../onboarding/flows/provision-v4';
import { createTemplateService } from '../onboarding/flows/save-template-v4';
import type { FilesGateway } from '../onboarding/ports/files';
import type { ImportService } from '../onboarding/ports/import';
import type { ListLifecyclePort, ListReadPort, ListWritePort } from '../onboarding/ports/lists';
import type { MembersGateway } from '../onboarding/ports/members';
import type { ActorSession } from '../onboarding/ports/session';
import type { OnboardingServices } from '../onboarding/ports/ui-services';
import type { FocusTarget } from '../ports/presentation';

export interface SessionScope {
  actor: ActorSession;
  lifetime: Lifetime;
  bootstrap(): Promise<RoomBootstrap>;
  dispose(): void;
}

export function createSessionScope(input: {
  actor: ActorSession;
  lifetime: Lifetime;
  budget: { dispose(): void };
  bootstrap(): Promise<RoomBootstrap>;
}): SessionScope {
  return {
    actor: input.actor,
    lifetime: input.lifetime,
    async bootstrap() {
      input.lifetime.assertActive();
      const result = await input.bootstrap();
      input.lifetime.assertActive();
      return result;
    },
    dispose() { input.lifetime.dispose(); input.budget.dispose(); },
  };
}

export function createOnboardingServices(input: {
  actor: ActorSession;
  binding: RoomBinding;
  lists: { read: ListReadPort; write: ListWritePort; lifecycle: ListLifecyclePort };
  files: FilesGateway;
  members: MembersGateway;
  imports?: ImportService;
  effects: { clock: Clock; ids: IdGenerator; hasher: Hasher; preferences: Preferences; lock: KeyedLock; scheduler: Scheduler; focus: FocusTarget };
}): OnboardingServices {
  const { actor, binding, lists, effects } = input;
  const catalogs = createCatalogs({ binding, read: lists.read });
  const templates = createTemplateService({ ...lists, binding, ids: effects.ids });
  const imports = input.imports ?? createImportService({ actor, binding, hasher: effects.hasher,
    gateway: createPrivosImportGateway({ binding, read: lists.read, templates }) });
  const legacyData = { ...lists, discovery: createListDiscovery(lists.read, lists.lifecycle) };
  return {
    catalogs, templates, imports,
    provision: createProvisionService({ ...lists, binding, actor, catalogs, hasher: effects.hasher }),
    learning: createLearningService({ ...lists, binding, actor, lock: effects.lock }),
    hr: createHrV4Actions(createPrivosHrGateway({ ...lists, binding }), binding.roomId, actor.roles),
    files: input.files, members: input.members,
    clock: effects.clock, hasher: effects.hasher, ids: effects.ids, preferences: effects.preferences, scheduler: effects.scheduler, focus: effects.focus,
    legacy: createLegacyServices(legacyData), legacyData,
  };
}
