import type { ImportedPosition } from './models';
import { createNodeFileSystem, createNodeHasher, createNodePositionSource } from './node-source';

export async function* readPositions(source: string): AsyncGenerator<ImportedPosition> {
  yield* createNodePositionSource(createNodeFileSystem(), source, createNodeHasher()).positions();
}