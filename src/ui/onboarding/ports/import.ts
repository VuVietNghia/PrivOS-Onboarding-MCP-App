import type { Hasher } from '../../../shared/ports/effects';
import type { ImportedPosition } from '../../../shared/import/models';
import type { ImportPreflight } from '../../../shared/import/preflight';
import type { RoomBinding } from '../domain/models';
import type { ActorSession } from './session';

export interface ImportPositionMatch { id: string; sourceMarker: string }
export interface ImportV4Gateway {
  findPositionsBySource(sourceKey: string): Promise<ImportPositionMatch[]>;
  checkTemplateKey(templateKey: string, sourceMarker: string): Promise<'ready' | 'conflict'>;
  saveDraft(position: ImportedPosition, sourceMarker: string, templateKey: string): Promise<string>;
}
export interface ImportPositionOutcome {
  state: 'created' | 'existing'; positionId: string; preflight: ImportPreflight;
}
export interface ImportService {
  importPosition(position: ImportedPosition): Promise<ImportPositionOutcome>;
}
export interface ImportDeps {
  gateway: ImportV4Gateway;
  hasher: Hasher;
  actor: ActorSession;
  binding: RoomBinding;
}
