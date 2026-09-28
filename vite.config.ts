import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/ui',
  base: './',
  server: {
    cors: true,
  },
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    // Every referenced asset becomes a real hashed `assets/` file, never an inlined base64
    // data URI — split-asset serving needs a filename to address over `ui://…/assets/<file>`.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Bound each Relay-served asset; the live Hub loaded this split build after
        // the previous single index bundle received a cached 404.
        manualChunks(id) {
          const moduleId = id.replaceAll('\\', '/');
          if (moduleId.includes('/node_modules/')) {
            if (/\/(?:react|react-dom|scheduler|@privos_ai\/app-react)\//.test(moduleId)) return 'vendor';
            return 'dependencies';
          }
          if (moduleId.includes('/src/ui/onboarding/views/templates/')) return 'template-views';
          if (moduleId.includes('/src/ui/onboarding/views/learning/')) return 'learning-views';
          if (moduleId.includes('/src/ui/onboarding/views/')) return 'onboarding-views';
          if (moduleId.includes('/src/ui/onboarding/data/')) return 'onboarding-data';
          return undefined;
        },
      },
    },
  },
});
