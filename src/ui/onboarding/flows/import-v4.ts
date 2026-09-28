import type { ImportedPosition } from '../../../shared/import/models';
import { preflightPosition, type ImportPreflight } from '../../../shared/import/preflight';
import { importSourceMarker } from '../../../shared/import/draft-tree';
import type { PositionSource } from '../../../shared/import/source';
import type { Hasher } from '../../../shared/ports/effects';
import { isRoomAdmin } from '../domain/roles';
import type { ImportDeps, ImportService, ImportPositionOutcome, ImportV4Gateway } from '../ports/import';

export type { ImportPositionMatch, ImportPositionOutcome, ImportV4Gateway } from '../ports/import';
export { importDraftTree, importSourceMarker } from '../../../shared/import/draft-tree';

export async function importTemplateKey(sourceKey: string, hasher: Hasher): Promise<string> {
  return `onb-tpl-import-${await hasher.sha256(sourceKey)}`;
}

export async function importPositionV4(gateway: ImportV4Gateway, position: ImportedPosition,
  hasher: Hasher): Promise<ImportPositionOutcome> {
  const preflight = preflightPosition(position);
  const marker = importSourceMarker(position);
  const legacyMarker = position.legacySourceFingerprint && /^[0-9a-f]{64}$/.test(position.legacySourceFingerprint)
    ? `${position.sourceKey}:${position.legacySourceFingerprint}` : undefined;
  const find = () => gateway.findPositionsBySource(position.sourceKey);
  const matches = await find();
  if (matches.length > 1) throw new Error('IMPORT_SOURCE_CONFLICT');
  if (matches.length === 1) {
    if (matches[0].sourceMarker !== marker && matches[0].sourceMarker !== legacyMarker) throw new Error('IMPORT_SOURCE_CHANGED');
    return { state: 'existing', positionId: matches[0].id, preflight };
  }
  const key = await importTemplateKey(position.sourceKey, hasher);
  if (await gateway.checkTemplateKey(key, marker) === 'conflict') throw new Error('IMPORT_ORPHAN_CONFLICT');
  let positionId: string;
  try { positionId = await gateway.saveDraft(position, marker, key); }
  catch (error) {
    const recovered = await find();
    if (recovered.length !== 1 || recovered[0].sourceMarker !== marker) throw error;
    positionId = recovered[0].id;
  }
  const verified = await find();
  if (verified.length !== 1 || verified[0].id !== positionId || verified[0].sourceMarker !== marker) throw new Error('IMPORT_SOURCE_CONFLICT');
  return { state: 'created', positionId, preflight };
}

export function createImportService(deps: ImportDeps): ImportService {
  return { importPosition(position) {
    if (!isRoomAdmin(deps.actor.roles)) throw new Error('NOT_ADMIN');
    if (!deps.actor.roomId || deps.actor.roomId !== deps.binding.roomId) throw new Error('ROOM_MISMATCH');
    return importPositionV4(deps.gateway, position, deps.hasher);
  } };
}

export async function* dryRunSource(source: PositionSource): AsyncGenerator<ImportPreflight> {
  for await (const position of source.positions()) yield preflightPosition(position);
}

export async function* importSource(source: PositionSource, service: ImportService): AsyncGenerator<ImportPositionOutcome> {
  for await (const position of source.positions()) yield await service.importPosition(position);
}
