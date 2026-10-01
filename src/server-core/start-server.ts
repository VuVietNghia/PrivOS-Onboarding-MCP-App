import type { Logger } from '../shared/ports/effects';
import type { McpHandler, UiMode, UiModeController } from './ports';

export type RuntimeMode = 'managed' | 'runtime-v3' | 'standalone-production' | 'development';
export interface StopHandle { stop(): Promise<void> }
export interface RuntimePort { start(handler: McpHandler): Promise<StopHandle & { mode: RuntimeMode }> }
export interface ServerConfig { production: boolean; devUi: boolean; transport: 'default' | 'relay' }
export interface ServerDeps {
  runtime: RuntimePort;
  handler: McpHandler;
  ui: UiModeController;
  config: ServerConfig;
  loadStandaloneUi(): Promise<string>;
  startDevUi(mode: RuntimeMode): Promise<StopHandle & { mode: UiMode }>;
  startDevelopmentRelay(): Promise<StopHandle>;
  logger: Logger;
}

export function onceAsync(action: () => Promise<void>): () => Promise<void> {
  let result: Promise<void> | undefined;
  return () => result ??= Promise.resolve().then(action);
}

export async function startServer(deps: ServerDeps): Promise<StopHandle> {
  const acquired: StopHandle[] = [];
  const cleanup = onceAsync(async () => {
    let first: unknown;
    for (const handle of acquired.reverse()) {
      try { await handle.stop(); }
      catch (error) {
        deps.logger.event('server.stop_failed', { code: 'STOP_FAILED' });
        first ??= error;
      }
    }
    if (first) throw first;
  });
  try {
    const runtime = await deps.runtime.start(deps.handler);
    acquired.push(runtime);
    const useDevUi = deps.config.devUi && !deps.config.production &&
      (runtime.mode === 'standalone-production' || runtime.mode === 'development' && deps.config.transport === 'relay');
    if (useDevUi) {
      const ui = await deps.startDevUi(runtime.mode);
      acquired.push(ui);
      deps.ui.set(ui.mode);
    } else if (runtime.mode === 'standalone-production') {
      deps.ui.set({ kind: 'inline', html: await deps.loadStandaloneUi() });
      deps.logger.event('server.ui_ready', { delivery: 'inline', build: 'production' });
    }
    if (runtime.mode === 'development' && deps.config.transport === 'relay') {
      acquired.push(await deps.startDevelopmentRelay());
    }
    return { stop: cleanup };
  } catch (error) {
    try { await cleanup(); } catch { /* preserve startup error */ }
    throw error;
  }
}
