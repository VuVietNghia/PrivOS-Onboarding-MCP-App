import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { serveBuiltUi, type ServeBuiltUi } from '@privos_ai/app-server';
import type { UiAssets, UiResource } from '../server-core/ports';

export function loadStandaloneUi(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

export function createBuiltUiAssets(distDir: string, appSlug: string): UiAssets {
  let built: ServeBuiltUi | undefined;
  const current = () => built ??= serveBuiltUi({ distDir: path.resolve(distDir), appSlug });
  return {
    renderHtml: () => current().renderHtml(),
    readAssetsManifest: () => current().readAssetsManifest(),
    readAsset: (uri): UiResource | null => current().readAsset(uri),
  };
}
