import { expect, it, vi } from 'vitest';
import { startServer } from '../../src/server-core/start-server';

it('stops the runtime once when starting the development UI fails', async () => {
  const stop = vi.fn(async () => {});
  const runtime = { start: vi.fn(async () => ({ mode: 'development' as const, stop })) };
  const handler = vi.fn(async () => ({}));
  const ui = { set: vi.fn() };
  await expect(startServer({
    runtime, handler, ui,
    config: { production: false, devUi: true, transport: 'relay' },
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
