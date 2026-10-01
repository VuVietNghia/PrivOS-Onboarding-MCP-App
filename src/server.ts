/**
 * Entry point. `serveApp` resolves exactly one of `managed` / `runtime-v3` /
 * `standalone-production` / `development` (a valid driver `runtime-v3` env
 * wins; otherwise precedence managed > standalone-production > development; a
 * fatal `RuntimeModeError` when both a managed workload socket and a paired
 * standalone identity file are present, or when `NODE_ENV=production` has none
 * of them) and wires the correct transport + trust bootstrap + agent-bot hub
 * internally.
 *
 * The ONE piece that stays app-local (by design) is the interactive
 * `development` Relay loop: `PRIVOS_TRANSPORT=relay` (`npm run dev`) steps
 * `serveApp` aside from the Direct HTTP MCP router and runs the terminal
 * pairing prompt here. Paired standalone sessions serve prebuilt production
 * inline HTML. An explicit local `PRIVOS_DEV_UI=1` selects P0 diagnostics
 * when NODE_ENV is not production.
 * `PRIVOS_TRANSPORT` is a
 * development affordance only — `serveApp` rejects `transportOverride` under any
 * production mode as a boot error.
 *
 * `/.well-known/mcp/manifest.json` is served from `createManifest()` (the exact
 * reviewed marketplace manifest, digest-pinned) via the `configure` hook, ahead
 * of the router, so the published manifest bytes never change.
 */
import 'dotenv/config';

import express from 'express';
import { fileURLToPath } from 'node:url';
import { RuntimeModeError } from '@privos_ai/app-server';

import { createManifest } from './manifest';
import { createAppMcpHandler } from './mcp-message-handlers';
import { createSdkRuntime } from './server-adapters/sdk-runtime';
import { loadStandaloneUi } from './server-adapters/built-ui-assets';
import { startServer } from './server-core/start-server';

/**
 * Manifest-only degraded surface for `PRODUCTION_WITHOUT_IDENTITY`.
 *
 * The marketplace build node runs the built image bare — no workload socket, no
 * identity file — and requires it to serve `/.well-known/mcp/manifest.json`
 * (an image that cannot be discovered cannot be installed). serveApp correctly
 * refuses to run MCP in production without an identity, so in that state this
 * app serves ONLY the public reviewed manifest plus /health, with /ready held
 * at 503: no /mcp surface exists, dispatch stays fail-closed, and a real
 * production misconfiguration still turns the container unhealthy instead of
 * silently passing. `AMBIGUOUS_RUNTIME_IDENTITY` remains a hard exit — two
 * identities present is stale state an operator must resolve.
 */
function startManifestOnlySurface(reason: string): void {
	const port = Number(process.env.PORT || 3000);
	const app = express();
	app.get('/.well-known/mcp/manifest.json', (_req, res) => res.json(createManifest()));
	app.get('/health', (_req, res) => res.status(200).json({ ok: true, status: 'alive', degraded: true }));
	app.get('/ready', (_req, res) => res.status(503).json({ ok: false, status: 'not_ready', reason: 'PRODUCTION_WITHOUT_IDENTITY' }));
	app.listen(port, '0.0.0.0', () => {
		console.error(`No runtime identity: ${reason}`);
		console.error(`Serving the manifest only on :${port} — no MCP surface until a workload socket or paired identity file is present.`);
	});
}

async function start(): Promise<void> {
	const transportOverride = process.env.PRIVOS_TRANSPORT === 'relay' ? ('relay' as const) : undefined;
	const mcp = createAppMcpHandler();
	await startServer({
		runtime: createSdkRuntime({ port: Number(process.env.PORT || 3000), transportOverride }),
		handler: mcp.handle,
		ui: mcp.ui,
		config: {
			production: process.env.NODE_ENV === 'production',
			devUi: process.env.PRIVOS_DEV_UI === '1',
			transport: transportOverride === 'relay' ? 'relay' : 'default',
		},
		loadStandaloneUi: () => loadStandaloneUi(fileURLToPath(new URL('../dist/standalone-ui.html', import.meta.url))),
		async startDevUi(mode) {
			if (mode === 'standalone-production') {
				const { buildP0InlineHtml } = await import('./p0-inline-ui');
				const html = await buildP0InlineHtml();
				console.log('[Dev] Onboarding v4 inline UI ready for paired Relay');
				return { mode: { kind: 'inline' as const, html }, stop: async () => {} };
			}
			const { startDevUiServer } = await import('./dev-server');
			const dev = await startDevUiServer();
			return { mode: { kind: 'dev-url' as const, publicUrl: dev.publicUrl }, stop: dev.close };
		},
		async startDevelopmentRelay() {
			const { createRelayMcpHandler, startDevelopmentRelay } = await import('./relay-transport');
			const relay = await startDevelopmentRelay(createRelayMcpHandler(mcp.handle));
			return { stop: () => relay.stop() };
		},
		logger: { event: (name, fields) => console.error(name, fields) },
	});
}

start().catch((err) => {
	if (err instanceof RuntimeModeError && err.code === 'PRODUCTION_WITHOUT_IDENTITY') {
		startManifestOnlySurface(err.message);
		return;
	}
	console.error('Failed to start:', err instanceof Error ? err.message : err);
	process.exit(1);
});
