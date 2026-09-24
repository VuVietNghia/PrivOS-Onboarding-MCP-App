/**
 * MCP JSON-RPC method handlers for the Onboarding app.
 * Production: the shell (`builtUi.renderHtml()`) and its hashed `assets/`
 * files are split over separate `resources/read` calls — the Hub fetches
 * assets once per installation generation and re-serves them from its own
 * origin. In development: reads source and builds on-the-fly via Vite.
 */
import { createManifest } from './manifest';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { serveBuiltUi, INVALID_PARAMS, type ServeBuiltUi, type VerifiedActor } from '@privos_ai/app-server';

import _pkg from '../privos-app.json';
import { getAppIconDataUri } from './app-icon';

const pkg = _pkg as Record<string, any>;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const TOOL_NAME = 'onboarding_dashboard';
/**
 * `ui://<appSlug>/…` — `appSlug` MUST be `app.appId`, i.e. `privos-app.json`'s `name`. The Hub
 * resolves `serveBuiltUi`'s asset/manifest URIs from the registered app id, not from this resource
 * URI — a mismatch 404s every asset. The tool's `ui.resourceUri` in `privos-app.json` must equal
 * this value too (guarded by `tests/ui-shell.spec.ts`), or the Hub asks for a URI this server refuses.
 */
const UI_RESOURCE_URI = `ui://${pkg.name}/form.html`;
/** `appSlug` for `serveBuiltUi` — derived from {@link UI_RESOURCE_URI}'s host so the two never drift. */
const UI_APP_SLUG = new URL(UI_RESOURCE_URI).host;
/** Sits beside {@link UI_RESOURCE_URI}, not under the `assets/` prefix — matches the SDK's own convention. */
const ASSETS_MANIFEST_URI = `${UI_RESOURCE_URI.slice(0, UI_RESOURCE_URI.lastIndexOf('/') + 1)}assets-manifest.json`;

const appIcon = getAppIconDataUri();

/**
 * Built once, lazily: constructing before `dist/ui` exists (e.g. `npm test` runs ahead of
 * `npm run build`) must not crash every caller that merely imports this module. `serveBuiltUi`
 * throws at construction on a malformed build — that failure surfaces the first time the UI is
 * actually requested, never earlier.
 */
let builtUi: ServeBuiltUi | null = null;
function getBuiltUi(): ServeBuiltUi {
	if (!builtUi) {
		builtUi = serveBuiltUi({ distDir: path.join(moduleDir, '../dist/ui'), appSlug: UI_APP_SLUG });
	}
	return builtUi;
}

/**
 * When set, the UI is served live from a Vite dev server at this public origin
 * (HMR + breakpoints) instead of the split production bundle. See dev-server.ts.
 */
let devPublicUrl: string | null = null;
let devUiHtml: string | null = null;

/** Enable dev mode: iframe loads UI from the Vite dev server at `publicUrl`. */
export function setDevPublicUrl(publicUrl: string): void {
	devPublicUrl = publicUrl.replace(/\/$/, '');
}

/** Serve the paired Relay P0 test bundle inline so Hub CSP cannot rewrite its script URLs. */
export function setDevUiHtml(html: string): void {
	devUiHtml = html;
}

/** The shell HTML for the current mode — inline P0, live Vite, or production assets. */
function currentShellHtml(): string {
	return devUiHtml ?? (devPublicUrl ? getDevUiHtml(devPublicUrl) : getBuiltUi().renderHtml());
}

/**
 * Handle an incoming MCP JSON-RPC request and return the result.
 *
 * `_actor` is the SDK-verified caller forwarded by the transports. The Onboarding app does every
 * data operation from the iframe as the logged-in user (via `app.rest`), so no server tool needs it;
 * the parameter stays so both transports keep one call signature.
 */
export async function handleMcpMessage(
	method: string,
	_id: number,
	params: any,
	_actor?: VerifiedActor,
): Promise<any> {
	switch (method) {
		case 'initialize':
			return {
				protocolVersion: '2025-03-26',
				capabilities: {
					tools: {},
					extensions: {
						'io.modelcontextprotocol/ui': {
							mimeTypes: ['text/html;profile=mcp-app'],
						},
					},
				},
				serverInfo: {
					// `name` must equal the manifest name (the Hub compares it at readiness); the
					// human-readable title rides in MCP's optional `title`.
					name: pkg.name,
					title: pkg.title,
					version: pkg.version,
					...(appIcon && { icon: appIcon }),
					// Advertise the exact schema-v2 declaration; Hub owns catalog metadata
					// and still enforces the selected subset server-side.
					...(Array.isArray(pkg.permissions) && { permissions: pkg.permissions }),
				},
			};

		case 'notifications/initialized':
			return {};

		case 'tools/list':
			// The reviewed manifest is the one source of tool definitions: the Hub's readiness
			// check compares its tools against the served list after lifting `_meta.ui` to
			// `ui`, so each manifest entry is served with its `ui` under `_meta` and nothing else.
			return { tools: createManifest().tools.map(({ ui, ...tool }) => (ui ? { ...tool, _meta: { ui } } : tool)) };

		case 'tools/call':
			if (params?.name !== TOOL_NAME) {
				throw new Error(`Unknown tool: ${params?.name || '<missing>'}`);
			}
			return {
				content: [
					{
						type: 'resource',
						resource: {
							uri: UI_RESOURCE_URI,
							mimeType: 'text/html;profile=mcp-app',
							text: currentShellHtml(),
						},
					},
				],
			};

		case 'resources/read':
			return handleResourcesRead(params?.uri);

		default:
			throw new Error(`Unknown method: ${method}`);
	}
}

/**
 * `resources/read` branches on the requested URI: the shell, the assets manifest, or one split
 * asset. Any other URI is refused. Explicit dev mode substitutes only the shell;
 * production assets remain readable for an older Hub installation generation.
 */
function handleResourcesRead(uri: unknown): { contents: unknown[] } {
	if ((devUiHtml || devPublicUrl) && uri === UI_RESOURCE_URI) {
		return {
			contents: [
				{
					uri: UI_RESOURCE_URI,
					mimeType: 'text/html;profile=mcp-app',
					text: currentShellHtml(),
				},
			],
		};
	}

	if (uri === UI_RESOURCE_URI) {
		return { contents: [{ uri: UI_RESOURCE_URI, mimeType: 'text/html;profile=mcp-app', text: currentShellHtml() }] };
	}

	if (uri === ASSETS_MANIFEST_URI) {
		return {
			contents: [{ uri: ASSETS_MANIFEST_URI, mimeType: 'application/json', text: JSON.stringify(getBuiltUi().readAssetsManifest()) }],
		};
	}

	const asset = typeof uri === 'string' ? getBuiltUi().readAsset(uri) : null;
	if (asset) return { contents: [asset] };

	throw Object.assign(new Error(`Unknown resource: ${typeof uri === 'string' ? uri : '<missing>'}`), {
		code: INVALID_PARAMS,
	});
}

/**
 * Build HTML referencing a live Vite dev server (HMR + TypeScript breakpoints).
 * Loads @vite/client and the React Fast Refresh preamble cross-origin from the
 * tunnel, then the real entry module — equivalent to what Vite injects into a
 * transformed index.html, but emitted here since the relay serves the document.
 */
function getDevUiHtml(publicUrl: string): string {
	const base = `${publicUrl}/ui`;
	return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${pkg.title || 'Onboarding'} (dev)</title>
  <script type="module" src="${base}/@vite/client"></script>
  <script type="module">
    import RefreshRuntime from "${base}/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${base}/main.tsx"></script>
</body>
</html>`;
}
