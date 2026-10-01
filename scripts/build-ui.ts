import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'vite';
import { buildStandaloneInlineHtml } from '../src/p0-inline-ui';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  root: path.join(root, 'src/ui'),
  configFile: path.join(root, 'vite.config.ts'),
  mode: 'production',
  esbuild: { jsxDev: false },
  define: { 'import.meta.env.DEV': 'false', 'process.env.NODE_ENV': JSON.stringify('production') },
});
const html = await buildStandaloneInlineHtml();
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/standalone-ui.html'), html, 'utf8');
console.log('[UI] Production split bundle and standalone inline HTML ready');
