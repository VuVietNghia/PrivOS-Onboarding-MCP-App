import type { ImportPreflight } from '../../src/shared/import/preflight';
import type { ImportPositionOutcome, ImportService } from '../../src/ui/onboarding/ports/import';
import { dryRunSource, importSource } from '../../src/ui/onboarding/flows/import-v4';
import { createNodeFileSystem, createNodeHasher, createNodePositionSource } from './node-source';

export async function* dryRunSourceV4(source: string): AsyncGenerator<ImportPreflight> {
  const positions = createNodePositionSource(createNodeFileSystem(), source, createNodeHasher());
  yield* dryRunSource(positions);
}

export async function* importSourceV4(source: string, service?: ImportService): AsyncGenerator<ImportPositionOutcome> {
  if (!service) throw new Error('IMPORT_WRITE_TRANSPORT_UNAVAILABLE');
  const positions = createNodePositionSource(createNodeFileSystem(), source, createNodeHasher());
  yield* importSource(positions, service);
}
