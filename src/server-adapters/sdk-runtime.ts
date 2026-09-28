import { serveApp, type ServeAppTransportOverride } from '@privos_ai/app-server';
import { buildRelayAppDescriptor, createManifest } from '../manifest';
import type { RuntimePort } from '../server-core/start-server';

export function createSdkRuntime(input: { port: number; transportOverride?: ServeAppTransportOverride }): RuntimePort {
  return {
    async start(handler) {
      const runtime = await serveApp({
        descriptor: buildRelayAppDescriptor(),
        createHandler: () => async (request, context) => handler(
          request.method, typeof request.id === 'number' ? request.id : 0, request.params, context.actor,
        ),
        port: input.port,
        ...(input.transportOverride ? { transportOverride: input.transportOverride } : {}),
        resolveManifest: () => createManifest(),
        configure: (app) => {
          app.get('/.well-known/mcp/manifest.json', (_req, res) => res.json(createManifest()));
        },
      });
      return { mode: runtime.mode, stop: () => runtime.close() };
    },
  };
}
