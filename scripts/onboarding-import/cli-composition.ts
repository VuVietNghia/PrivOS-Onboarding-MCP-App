import type { PositionSource } from '../../src/shared/import/source';
import type { ImportPreflight } from '../../src/shared/import/preflight';
import type { ImportPositionOutcome, ImportService } from '../../src/ui/onboarding/ports/import';
import { dryRunSource, importSource } from '../../src/ui/onboarding/flows/import-v4';

export type CliImportConfig =
  | { mode: 'dry-run'; source: PositionSource }
  | { mode: 'write'; source: PositionSource; service?: ImportService };

export async function* runImport(config: CliImportConfig): AsyncGenerator<ImportPreflight | ImportPositionOutcome> {
  if (config.mode === 'dry-run') {
    yield* dryRunSource(config.source);
    return;
  }
  if (!config.service) throw new Error('IMPORT_WRITE_TRANSPORT_UNAVAILABLE');
  yield* importSource(config.source, config.service);
}
