/**
 * Build inline UI for a paired Relay app, with diagnostics only in P0 mode.
 * The Hub rewrites external script URLs inside its srcdoc iframe to a
 * standalone-relay: scheme, which its CSP rejects. Inline JS/CSS is allowed.
 * The build stays in memory; the CLI saves production HTML outside dist/ui.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const uiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui');

function escapeRawElement(value: string, tag: 'script' | 'style'): string {
  return value.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

export async function buildP0InlineHtml(): Promise<string> {
  return buildInlineHtml('development');
}

export async function buildStandaloneInlineHtml(): Promise<string> {
  return buildInlineHtml('production');
}

async function buildInlineHtml(mode: 'development' | 'production'): Promise<string> {
  const development = mode === 'development';
  const result = await build({
    configFile: false,
    root: uiRoot,
    base: './',
    mode,
    plugins: [react()],
    esbuild: { jsxDev: development },
    // P0 diagnostics and the React runtime must match the chosen build mode.
    define: {
      'import.meta.env.DEV': String(development),
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      write: false,
      sourcemap: false,
      cssCodeSplit: false,
      lib: {
        entry: path.join(uiRoot, 'main.tsx'),
        name: development ? 'PrivOSOnboardingP0' : 'PrivOSOnboarding',
        formats: ['iife'],
        fileName: development ? 'p0' : 'standalone',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });

  if (!result || 'on' in result) throw new Error('Inline UI build returned a watcher instead of assets');
  const assets = Array.isArray(result) ? result.flatMap((part) => part.output) : result.output;
  const scripts = assets.filter((asset) => asset.type === 'chunk');
  const outputAssets = assets.filter((asset): asset is Extract<(typeof assets)[number], { type: 'asset' }> => asset.type === 'asset');
  const styles = outputAssets.filter((asset) => asset.fileName.endsWith('.css'));
  const unexpected = outputAssets.filter((asset) => !asset.fileName.endsWith('.css'));
  if (scripts.length !== 1 || styles.length !== 1 || unexpected.length !== 0) {
    throw new Error(`Inline UI requires one JS and CSS asset; got ${scripts.length} JS, ${styles.length} CSS, ${unexpected.length} other`);
  }

  const css = typeof styles[0].source === 'string'
    ? styles[0].source
    : new TextDecoder().decode(styles[0].source);
  const js = scripts[0].code;
  if (development && (!js.includes('P0 Hub contract tests') || !js.includes('P0.2 ACL and Files'))) {
    throw new Error('P0 controls were excluded from the inline build');
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PrivOS Onboarding MCP App</title>
  <style>${escapeRawElement(css, 'style')}</style>
</head>
<body>
  <div id="root"></div>
  <script>${escapeRawElement(js, 'script')}</script>
</body>
</html>`;
}
