import type { Clock, Hasher, IdGenerator, Preferences, Scheduler } from '../../../shared/ports/effects';
import type { Catalogs } from './catalogs';
import type { FilesGateway } from './files';
import type { ImportService } from './import';
import type { LearningService } from './learning';
import type { MembersGateway } from './members';
import type { ProvisionService } from './provision';
import type { TemplateService } from './template';
import type { HrActions } from './hr';
import type { LegacyDeps, LegacyServices } from './legacy';
import type { FocusTarget } from '../../ports/presentation';

export interface OnboardingServices {
  catalogs: Catalogs;
  templates: TemplateService;
  provision: ProvisionService;
  learning: LearningService;
  hr: HrActions;
  files: FilesGateway;
  members: MembersGateway;
  imports: ImportService;
  clock: Clock;
  hasher: Hasher;
  ids: IdGenerator;
  preferences: Preferences;
  scheduler: Scheduler;
  focus: FocusTarget;
  legacy: LegacyServices;
  legacyData: LegacyDeps;
}
