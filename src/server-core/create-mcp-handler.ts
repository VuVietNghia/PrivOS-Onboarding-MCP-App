import { z } from 'zod';
import type { McpHandler, McpHandlerDeps, UiMode, UiModeController } from './ports';

export const TOOL_NAME = 'onboarding_dashboard';
const INVALID_PARAMS = -32602;
const toolCall = z.object({ name: z.string() });
const resourceRead = z.object({ uri: z.string() });

function invalidParams(message: string): Error {
  return Object.assign(new Error(message), { code: INVALID_PARAMS });
}

function devUiHtml(publicUrl: string, title: string): string {
  const base = `${publicUrl.replace(/\/$/, '')}/ui`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} (dev)</title>
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

export function createMcpHandler(deps: McpHandlerDeps): { handle: McpHandler; ui: UiModeController } {
  let mode: UiMode = { kind: 'built' };
  const resourceUri = `ui://${deps.metadata.name}/form.html`;
  const assetsManifestUri = `ui://${deps.metadata.name}/assets-manifest.json`;
  const shell = () => {
    switch (mode.kind) {
      case 'built': return deps.assets.renderHtml();
      case 'inline': return mode.html;
      case 'dev-url': return devUiHtml(mode.publicUrl, deps.metadata.title);
    }
  };
  const shellResource = () => ({ uri: resourceUri, mimeType: 'text/html;profile=mcp-app', text: shell() });
  return {
    ui: { set(next) { mode = next; } },
    async handle(method, _id, params, _actor) {
      switch (method) {
        case 'initialize':
          return {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
            serverInfo: {
              ...deps.metadata,
              ...(deps.icon ? { icon: deps.icon } : {}),
            },
          };
        case 'notifications/initialized': return {};
        case 'tools/list':
          return { tools: deps.manifest.tools.map(({ ui, ...tool }) => ui ? { ...tool, _meta: { ui } } : tool) };
        case 'tools/call': {
          const parsed = toolCall.safeParse(params);
          if (!parsed.success) throw invalidParams('Tool name is required');
          if (parsed.data.name !== TOOL_NAME) throw new Error(`Unknown tool: ${parsed.data.name}`);
          return { content: [{ type: 'resource', resource: shellResource() }] };
        }
        case 'resources/read': {
          const parsed = resourceRead.safeParse(params);
          if (!parsed.success) throw invalidParams('Resource URI is required');
          const { uri } = parsed.data;
          if (uri === resourceUri) return { contents: [shellResource()] };
          if (uri === assetsManifestUri) return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(deps.assets.readAssetsManifest()) }] };
          const asset = deps.assets.readAsset(uri);
          if (asset) return { contents: [asset] };
          throw invalidParams(`Unknown resource: ${uri}`);
        }
        default: throw new Error(`Unknown method: ${method}`);
      }
    },
  };
}
