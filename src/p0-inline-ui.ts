/**
 * Build the P0 test UI into one HTML resource for a paired Relay app.
 * The Hub rewrites external script URLs inside its srcdoc iframe to a
 * standalone-relay: scheme, which its CSP rejects. Inline JS/CSS is allowed.
 * This build stays in memory and never replaces the production dist/ui bundle.
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
  const result = await build({
    configFile: false,
    root: uiRoot,
    base: './',
    plugins: [react()],
    // P0 controls are excluded from the production bundle by import.meta.env.DEV.
    define: {
      'import.meta.env.DEV': 'true',
      // The app process runs NODE_ENV=development, so Vite emits jsxDEV.
      // Inline the matching React development runtime guard for the browser.
      'process.env.NODE_ENV': JSON.stringify('development'),
    },
    build: {
      write: false,
      sourcemap: false,
      cssCodeSplit: false,
      lib: {
        entry: path.join(uiRoot, 'main.tsx'),
        name: 'PrivOSOnboardingP0',
        formats: ['iife'],
        fileName: 'p0',
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });

  if (!result || 'on' in result) throw new Error('P0 UI build returned a watcher instead of assets');
  const assets = Array.isArray(result) ? result.flatMap((part) => part.output) : result.output;
  const scripts = assets.filter((asset) => asset.type === 'chunk');
  const outputAssets = assets.filter((asset): asset is Extract<(typeof assets)[number], { type: 'asset' }> => asset.type === 'asset');
  const styles = outputAssets.filter((asset) => asset.fileName.endsWith('.css'));
  const unexpected = outputAssets.filter((asset) => !asset.fileName.endsWith('.css'));
  if (scripts.length !== 1 || styles.length !== 1 || unexpected.length !== 0) {
    throw new Error(`P0 UI requires one inline JS and CSS asset; got ${scripts.length} JS, ${styles.length} CSS, ${unexpected.length} other`);
  }

  const css = typeof styles[0].source === 'string'
    ? styles[0].source
    : new TextDecoder().decode(styles[0].source);
  const js = scripts[0].code;
  if (!js.includes('P0 Hub contract tests') || !js.includes('P0.2 ACL and Files')) {
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
