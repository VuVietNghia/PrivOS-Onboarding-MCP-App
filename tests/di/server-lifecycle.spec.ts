import { expect, it, vi } from 'vitest';
import { startServer } from '../../src/server-core/start-server';
import { createMcpHandler } from '../../src/server-core/create-mcp-handler';
import { createManifest } from '../../src/manifest';

it.each([false, true])('serves inline UI for a paired standalone session with production=%s and no dev flags', async (production) => {
  const app = createMcpHandler({
    assets: { renderHtml: () => '<script src="./assets/old.js"></script>', readAssetsManifest: () => ({}), readAsset: () => null },
    icon: undefined,
    manifest: createManifest(),
    metadata: { name: 'test-app', title: 'Test', version: '1.0.0' },
  });
  const handle = await startServer({
    runtime: { start: async () => ({ mode: 'standalone-production', stop: async () => {} }) },
    handler: app.handle, ui: app.ui,
    config: { production, devUi: false, transport: 'default' },
    loadStandaloneUi: async () => '<div id="root"></div><script>window.inlineReady=true</script>',
    startDevUi: async () => { throw new Error('UNEXPECTED_DEV_UI'); },
    startDevelopmentRelay: async () => { throw new Error('UNEXPECTED_DEV_RELAY'); },
    logger: { event() {} },
  });
  const result = await app.handle('resources/read', 1, { uri: 'ui://test-app/form.html' });
  expect(result).toEqual({ contents: [{ uri: 'ui://test-app/form.html', mimeType: 'text/html;profile=mcp-app',
    text: '<div id="root"></div><script>window.inlineReady=true</script>' }] });
  await handle.stop();
});

it('stops the runtime if the standalone UI artifact cannot be read', async () => {
  const stopped: string[] = [];
  await expect(startServer({
    runtime: { start: async () => ({ mode: 'standalone-production', stop: async () => { stopped.push('runtime'); } }) },
    handler: async () => ({}), ui: { set() {} },
    config: { production: false, devUi: false, transport: 'default' },
    loadStandaloneUi: async () => { throw new Error('STANDALONE_UI_MISSING'); },
    startDevUi: async () => { throw new Error('UNEXPECTED_DEV_UI'); },
    startDevelopmentRelay: async () => { throw new Error('UNEXPECTED_DEV_RELAY'); },
    logger: { event() {} },
  })).rejects.toThrow('STANDALONE_UI_MISSING');
  expect(stopped).toEqual(['runtime']);
});

it.each(['managed', 'runtime-v3', 'development'] as const)('keeps split assets in %s mode', async (mode) => {
  const selected: unknown[] = [];
  const handle = await startServer({
    runtime: { start: async () => ({ mode, stop: async () => {} }) },
    handler: async () => ({}), ui: { set(value) { selected.push(value); } },
    config: { production: false, devUi: true, transport: 'default' },
    loadStandaloneUi: async () => { throw new Error('UNEXPECTED_STANDALONE_UI'); },
    startDevUi: async () => { throw new Error('UNEXPECTED_DEV_UI'); },
    startDevelopmentRelay: async () => { throw new Error('UNEXPECTED_DEV_RELAY'); },
    logger: { event() {} },
  });
  expect(selected).toEqual([]);
  await handle.stop();
});

it('allows explicitly requested P0 inline UI to override the standalone production artifact', async () => {
  const selected: unknown[] = [];
  const handle = await startServer({
    runtime: { start: async () => ({ mode: 'standalone-production', stop: async () => {} }) },
    handler: async () => ({}), ui: { set(value) { selected.push(value); } },
    config: { production: false, devUi: true, transport: 'default' },
    loadStandaloneUi: async () => { throw new Error('UNEXPECTED_STANDALONE_UI'); },
    startDevUi: async () => ({ mode: { kind: 'inline', html: '<script>p0Ready=true</script>' }, stop: async () => {} }),
    startDevelopmentRelay: async () => { throw new Error('UNEXPECTED_DEV_RELAY'); },
    logger: { event() {} },
  });
  expect(selected).toEqual([{ kind: 'inline', html: '<script>p0Ready=true</script>' }]);
  await handle.stop();
});

it('stops the runtime once when starting the development UI fails', async () => {
  const stop = vi.fn(async () => {});
  const runtime = { start: vi.fn(async () => ({ mode: 'development' as const, stop })) };
  const handler = vi.fn(async () => ({}));
  const ui = { set: vi.fn() };
  await expect(startServer({
    runtime, handler, ui,
    config: { production: false, devUi: true, transport: 'relay' },
    loadStandaloneUi: async () => { throw new Error('UNEXPECTED_STANDALONE_UI'); },
    startDevUi: async () => { throw new Error('VITE_FAILED'); },
    startDevelopmentRelay: async () => ({ stop: async () => {} }),
    logger: { event() {} },
  })).rejects.toThrow('VITE_FAILED');
  expect(stop).toHaveBeenCalledTimes(1);
});

it('stops acquired handles in reverse order and is idempotent', async () => {
  const order: string[] = [];
  const handle = await startServer({
    runtime: { start: async () => ({ mode: 'development', stop: async () => { order.push('runtime'); } }) },
    handler: async () => ({}), ui: { set() {} },
    config: { production: false, devUi: true, transport: 'relay' },
    loadStandaloneUi: async () => { throw new Error('UNEXPECTED_STANDALONE_UI'); },
    startDevUi: async () => ({ mode: { kind: 'dev-url', publicUrl: 'http://localhost:5179' }, stop: async () => { order.push('ui'); } }),
    startDevelopmentRelay: async () => ({ stop: async () => { order.push('relay'); } }),
    logger: { event() {} },
  });
  await Promise.all([handle.stop(), handle.stop()]);
  expect(order).toEqual(['relay', 'ui', 'runtime']);
});

it('continues cleanup after a stop failure and reports the first error once', async () => {
  const order: string[] = [];
  const events: string[] = [];
  const handle = await startServer({
    runtime: { start: async () => ({ mode: 'development', stop: async () => { order.push('runtime'); } }) },
    handler: async () => ({}), ui: { set() {} },
    config: { production: false, devUi: true, transport: 'relay' },
    loadStandaloneUi: async () => { throw new Error('UNEXPECTED_STANDALONE_UI'); },
    startDevUi: async () => ({ mode: { kind: 'dev-url', publicUrl: 'http://localhost:5179' },
      stop: async () => { order.push('ui'); throw new Error('UI_STOP_FAILED'); } }),
    startDevelopmentRelay: async () => ({ stop: async () => { order.push('relay'); } }),
    logger: { event: (name) => { events.push(name); } },
  });
  await expect(handle.stop()).rejects.toThrow('UI_STOP_FAILED');
  await expect(handle.stop()).rejects.toThrow('UI_STOP_FAILED');
  expect(order).toEqual(['relay', 'ui', 'runtime']);
  expect(events).toEqual(['server.stop_failed']);
});
