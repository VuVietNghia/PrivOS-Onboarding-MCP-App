import type { AppManifest } from '../../src/manifest';
import type { CommandRunner, WorkspaceFiles } from './ports';

export const PREFLIGHT_RULESET = 'marketplace-validation-mirror/2026-08-02';

export interface PackageMeta {
  name: string;
  version: string;
  title: string;
  description: string;
  repository: { url: string };
  dockerfilePath: string;
}

export interface PreflightDeps {
  root: string;
  paths: { join(...parts: string[]): string };
  files: WorkspaceFiles;
  commands: CommandRunner;
  manifest: AppManifest;
  packageMeta: PackageMeta;
  supportedSchemaVersions: readonly number[];
  marketplaceFields: readonly string[];
  lint(manifest: AppManifest): Promise<readonly string[]>;
  checkRuntimeManifest(): Promise<boolean>;
}

export interface PreflightResult { failures: string[] }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function collectSources(files: WorkspaceFiles, paths: PreflightDeps['paths'], dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await files.list(dir)) {
    const target = paths.join(dir, entry.name);
    if (entry.directory) result.push(...await collectSources(files, paths, target));
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(await files.readText(target));
  }
  return result;
}

export async function runPreflight(deps: PreflightDeps): Promise<PreflightResult> {
  const failures: string[] = [];
  const fail = (message: string, fix: string) => failures.push(`${message}\n  Fix: ${fix}`);
  const at = (file: string) => deps.paths.join(deps.root, file);
  const { manifest, packageMeta: pkg } = deps;
  if (JSON.stringify(Object.keys(manifest)) !== JSON.stringify(deps.marketplaceFields)) {
    fail('Manifest contains unsupported or missing fields.', 'Keep privos-app.json aligned with MARKETPLACE_MANIFEST_FIELDS.');
  }
  for (const field of ['name', 'version', 'title', 'description'] as const) {
    if (manifest[field] !== pkg[field]) fail(`Manifest field "${field}" differs from package.json.`, 'Keep package identity fields synchronized with privos-app.json.');
  }
  if (!deps.supportedSchemaVersions.includes(manifest.schemaVersion) || manifest.kind !== 'mcp-app') {
    fail('privos-app.json is not a supported MCP app manifest.',
      `Set schemaVersion to one of ${deps.supportedSchemaVersions.join(', ')} and kind to mcp-app.`);
  }
  if (manifest.repository !== pkg.repository.url) {
    fail('Manifest repository differs from package.json.', 'Use the canonical GitHub repository URL in both files.');
  }

  const lock = record(JSON.parse(await deps.files.readText(at('package-lock.json'))));
  const packages = record(lock?.packages);
  const lockRoot = record(packages?.['']);
  const versions = [lock?.version, lockRoot?.version];
  if (versions.some((version) => version !== pkg.version)) {
    fail(`package-lock.json declares ${versions.join(' / ')} but the app is ${pkg.version}.`,
      'Run `npm install --package-lock-only` after every version bump and commit the lockfile.');
  }
  const localLinks = Object.keys(packages ?? {}).filter((entry) => entry.startsWith('../'));
  if (localLinks.length) fail(`package-lock.json links local checkouts: ${localLinks.join(', ')}.`,
    'Depend on published package versions; a clean build cannot resolve a path outside the archive.');

  const changelog = await deps.files.exists(at('CHANGELOG.md')) ? await deps.files.readText(at('CHANGELOG.md')) : '';
  if (!changelog.includes(`## [${pkg.version}]`)) fail(`CHANGELOG.md has no entry for ${pkg.version}.`,
    'Add a `## [version] - date` section describing the release in the same commit as the bump.');
  if (!pkg.dockerfilePath || !await deps.files.exists(at(pkg.dockerfilePath))) {
    fail(`Dockerfile is missing at "${pkg.dockerfilePath || '<unset>'}".`, 'Set dockerfilePath and commit that file inside the source archive.');
  }

  const scopeDocs = await deps.files.exists(at('SCOPES.md')) ? await deps.files.readText(at('SCOPES.md')) : '';
  const uiSources = (await collectSources(deps.files, deps.paths, at('src/ui'))).join('\n');
  for (const error of await deps.lint(manifest)) fail(`Manifest: ${error}.`, 'Run npm run manifest:lint and correct the reported contract.');
  for (const permission of manifest.permissions) {
    const scope = permission.scope;
    if (!scopeDocs.includes(`\`${scope}\``) || !uiSources.includes(scope)) {
      fail(`Scope "${scope}" lacks a justification or annotated call site.`, 'Document it in SCOPES.md and reference it beside the real API call, or remove it.');
    }
  }

  for (const required of ['scripts/package-source.sh', '.dockerignore']) {
    if (!await deps.files.exists(at(required))) fail(`${required} is missing.`, 'Restore the safe packaging files from the reference app.');
  }
  const archive = `dist-source/${pkg.name.replace(/\//g, '-')}-${pkg.version}.zip`;
  const packaged = await deps.commands.run('bash', ['scripts/package-source.sh', '--allow-dirty'], { cwd: deps.root, env: {} });
  if (packaged.exitCode !== 0) {
    fail('Safe source packaging failed.', `Resolve the reported unsafe file or archive error:\n${packaged.stderr.trim()}`);
  } else {
    const listing = await deps.commands.run('unzip', ['-Z1', archive], { cwd: deps.root, env: {} });
    const entries = listing.stdout.split('\n');
    if (listing.exitCode !== 0 || !entries.includes(pkg.dockerfilePath)) {
      fail('The declared Dockerfile is not contained in the packaged ZIP.', 'Commit Dockerfile and ensure package-source.sh includes it.');
    }
    if (!entries.includes('privos-app.json')) {
      fail('privos-app.json is not at the ZIP root.', 'Commit the canonical manifest at the repository root.');
    }
    if (await deps.files.size(at(archive)) > 200 * 1024 * 1024) {
      fail('The packaged archive exceeds 200 MiB.', 'Remove generated assets or dependencies from the source archive.');
    }
  }
  if (!await deps.checkRuntimeManifest()) {
    fail('The running app did not serve the authoritative manifest.', 'Route GET /.well-known/mcp/manifest.json to createManifest() via serveApp configure.');
  }
  return { failures };
}
