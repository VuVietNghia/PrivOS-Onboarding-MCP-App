import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManifest } from './manifest';
import { getAppIconDataUri } from './app-icon';
import { createBuiltUiAssets } from './server-adapters/built-ui-assets';
import { createMcpHandler, TOOL_NAME } from './server-core/create-mcp-handler';

export { TOOL_NAME };

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export function createAppMcpHandler(): ReturnType<typeof createMcpHandler> {
  const manifest = createManifest();
  return createMcpHandler({
    assets: createBuiltUiAssets(path.join(moduleDir, '../dist/ui'), manifest.name),
    icon: getAppIconDataUri(),
    manifest,
    metadata: { name: manifest.name, title: manifest.title, version: manifest.version, permissions: manifest.permissions },
  });
}
