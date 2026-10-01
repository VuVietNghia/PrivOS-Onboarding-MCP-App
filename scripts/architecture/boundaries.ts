export type ModuleRole = 'domain' | 'port' | 'flow' | 'view' | 'adapter' | 'composition' | 'entry' | 'config';
export interface BoundaryRule {
  path: string;
  role: ModuleRole;
  allowedEffects: readonly string[];
  reason: string;
}

const pureRoots = [
  ['src/ui/onboarding/domain/', 'domain'],
  ['src/ui/onboarding/ports/', 'port'],
  ['src/ui/onboarding/flows/', 'flow'],
  ['src/ui/onboarding/views/', 'view'],
  ['src/ui/onboarding/components/', 'view'],
  ['src/ui/onboarding/dev/', 'view'],
  ['src/ui/onboarding/data/', 'domain'],
  ['src/ui/ports/', 'port'],
  ['src/shared/ports/', 'port'],
  ['src/shared/import/', 'domain'],
  ['src/shared/', 'domain'],
  ['scripts/onboarding-import/', 'domain'],
  ['scripts/core/', 'flow'],
  ['src/server-core/', 'flow'],
] as const;
const adapterRoots = [
  'src/ui/onboarding/data/privos/', 'src/ui/onboarding/dev/privos-probes.tsx',
  'src/ui/adapters/', 'src/server-adapters/', 'scripts/adapters/',
  'scripts/onboarding-import/node-source.ts', 'scripts/onboarding-import/cli-composition.ts',
  'scripts/onboarding-import/import-source-v4.ts', 'scripts/onboarding-import/read-source.ts',
  'src/ui/privos-rest.ts',
  'src/relay-transport.ts', 'src/dev-server.ts', 'src/app-icon.ts', 'src/p0-inline-ui.ts',
  'src/manifest.ts',
  'src/ui/onboarding/data/files.ts', 'src/ui/onboarding/data/tool-result.ts',
  'src/ui/onboarding/data/isolated-lists.ts', 'src/ui/onboarding/data/onboarding-lists.ts',
  'src/ui/onboarding/data/room-folders.ts', 'src/ui/onboarding/data/room-members.ts',
  'src/ui/onboarding/data/v2-lists.ts',
] as const;

export function boundaryFor(path: string): BoundaryRule {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  if (adapterRoots.some((root) => normalized.startsWith(root))) {
    return { path: normalized, role: 'adapter', allowedEffects: ['SDK', 'browser', 'node'], reason: 'Concrete boundary' };
  }
  const pure = pureRoots.find(([root]) => normalized.startsWith(root));
  if (pure) return { path: normalized, role: pure[1], allowedEffects: [], reason: 'Injected dependencies only' };
  if (normalized.startsWith('src/ui/composition/') || normalized === 'src/ui/App.tsx'
    || normalized === 'src/ui/main.tsx' || normalized === 'src/server.ts'
    || normalized === 'src/mcp-message-handlers.ts') {
    return { path: normalized, role: 'composition', allowedEffects: ['SDK', 'browser'], reason: 'Browser composition root' };
  }
  if (normalized.endsWith('.config.ts') || normalized.includes('/config/')
    || normalized.startsWith('scripts/architecture/') || normalized.startsWith('scripts/i18n/')) {
    return { path: normalized, role: 'config', allowedEffects: ['node'], reason: 'Build configuration' };
  }
  if (['scripts/build-ui.ts', 'scripts/generate-manifest.ts', 'scripts/pair.ts', 'scripts/preflight.ts'].includes(normalized)) {
    return { path: normalized, role: 'entry', allowedEffects: ['SDK', 'node'], reason: 'CLI composition entry' };
  }
  if (normalized.startsWith('src/ui/')) return { path: normalized, role: 'view', allowedEffects: [], reason: 'View defaults to injected effects' };
  return { path: normalized, role: 'domain', allowedEffects: [], reason: 'New modules default to pure' };
}
