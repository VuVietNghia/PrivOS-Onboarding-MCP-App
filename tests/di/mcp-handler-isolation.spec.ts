import { expect, it } from 'vitest';
import { createManifest } from '../../src/manifest';
import { createMcpHandler } from '../../src/server-core/create-mcp-handler';

it('keeps inline UI mode and assets within each handler instance', async () => {
  const manifest = createManifest();
  const deps = {
    manifest, icon: undefined,
    metadata: { name: manifest.name, title: manifest.title, version: manifest.version, permissions: manifest.permissions },
    assets: { renderHtml: () => 'BUILT', readAssetsManifest: () => ({}), readAsset: (_uri: string) => null },
  };
  const first = createMcpHandler(deps);
  const second = createMcpHandler(deps);
  first.ui.set({ kind: 'inline', html: 'INLINE_A' });
  const request = { name: 'onboarding_dashboard' };
  expect(JSON.stringify(await first.handle('tools/call', 1, request))).toContain('INLINE_A');
  expect(JSON.stringify(await second.handle('tools/call', 2, request))).toContain('BUILT');
});
