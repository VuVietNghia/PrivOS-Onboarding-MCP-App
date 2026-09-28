import type { AppManifest } from '../../src/manifest';
import type { WorkspaceFiles } from './ports';

export async function generateManifest(deps: {
  files: Pick<WorkspaceFiles, 'mkdir' | 'writeText'>;
  manifest: AppManifest;
  outputDirectory: string;
  outputFile: string;
}): Promise<void> {
  await deps.files.mkdir(deps.outputDirectory);
  await deps.files.writeText(deps.outputFile, JSON.stringify(deps.manifest, null, 2) + '\n');
}
