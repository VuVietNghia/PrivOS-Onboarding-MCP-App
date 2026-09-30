import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { alias: [{ find: './privos-probes', replacement: fileURLToPath(new URL('./member-probe-provider.tsx', import.meta.url)) }] },
  build: { rollupOptions: { input: fileURLToPath(new URL('./member-theme.html', import.meta.url)) } },
});
