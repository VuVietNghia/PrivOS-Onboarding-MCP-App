import { expect, it, vi } from 'vitest';
import { createManifest } from '../../src/manifest';
import { generateManifest } from '../../scripts/core/generate-manifest';
import { pairAndStart } from '../../scripts/core/pair';
import { runPreflight } from '../../scripts/core/preflight';

it('writes exactly the canonical manifest to the injected destination', async () => {
  const mkdir = vi.fn(async (_path: string) => {});
  const writeText = vi.fn(async (_path: string, _text: string) => {});
  const manifest = createManifest();
  await generateManifest({ files: { mkdir, writeText }, manifest, outputDirectory: 'dist', outputFile: 'dist/manifest.json' });
  expect(mkdir).toHaveBeenCalledWith('dist');
  expect(writeText).toHaveBeenCalledWith('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
});

it('reports a mismatched lockfile without running a real packaging command', async () => {
  const commands = { run: vi.fn(async () => ({ exitCode: 0, stdout: 'Dockerfile\nprivos-app.json\n', stderr: '' })) };
  const files = {
    readText: async (path: string) => path.endsWith('package-lock.json')
      ? JSON.stringify({ version: 'old', packages: { '': { version: 'old' } } })
      : path.endsWith('SCOPES.md') ? '`basic:information`' : '## [3.0.0]',
    writeText: async () => {}, mkdir: async () => {}, exists: async () => true,
    list: async () => [], size: async () => 0,
  };
  const result = await runPreflight({
    root: '.', paths: { join: (...parts) => parts.join('/') }, files, commands, manifest: createManifest(),
    packageMeta: { name: 'ai.privos.onboarding-mcp-app', version: '3.0.0', title: 'PrivOS Onboarding MCP App',
      description: createManifest().description, repository: { url: createManifest().repository }, dockerfilePath: 'Dockerfile' },
    supportedSchemaVersions: [createManifest().schemaVersion],
    marketplaceFields: Object.keys(createManifest()),
    lint: async () => [], checkRuntimeManifest: async () => true,
  });
  expect(result.failures.some((failure) => failure.includes('package-lock.json'))).toBe(true);
  expect(commands.run).toHaveBeenCalled();
});

it('does not start the server when approval is denied', async () => {
  const start = vi.fn(async () => 0);
  await expect(pairAndStart({
    prompt: { ask: async () => 'https://hub.example/pair' },
    readManifest: async () => createManifest(),
    pair: async () => { throw new Error('DENIED'); },
    start,
  })).rejects.toThrow('DENIED');
  expect(start).not.toHaveBeenCalled();
});

it('does not start the server for a pairing response without standalone trust', async () => {
  const start = vi.fn(async () => 0);
  const onApproved = vi.fn();
  await expect(pairAndStart({
    prompt: { ask: async () => 'https://hub.example/pair' },
    readManifest: async () => createManifest(),
    pair: async () => ({ pairingVersion: 1, identityFilePath: 'untrusted.json' }),
    onApproved,
    start,
  })).rejects.toThrow('pairingVersion 2');
  expect(onApproved).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});

it('exits after trusted pairing in pair-only mode without starting a server', async () => {
  const start = vi.fn(async () => 9);
  const onApproved = vi.fn();
  const result = await pairAndStart({
    mode: 'pair-only',
    prompt: { ask: async () => 'https://hub.example/pair' },
    readManifest: async () => createManifest(),
    pair: async () => ({ pairingVersion: 2, identityFilePath: '/var/lib/privos/identity/app.json' }),
    onApproved,
    start,
  });
  expect(result).toEqual({ identityFilePath: '/var/lib/privos/identity/app.json', exitCode: 0 });
  expect(onApproved).toHaveBeenCalledWith('/var/lib/privos/identity/app.json');
  expect(start).not.toHaveBeenCalled();
});

it('keeps starting the server and propagating its exit code in default pairing mode', async () => {
  const result = await pairAndStart({
    prompt: { ask: async () => 'https://hub.example/pair' },
    readManifest: async () => createManifest(),
    pair: async () => ({ pairingVersion: 2, identityFilePath: 'identity.json' }),
    start: async () => 7,
  });
  expect(result).toEqual({ identityFilePath: 'identity.json', exitCode: 7 });
});
