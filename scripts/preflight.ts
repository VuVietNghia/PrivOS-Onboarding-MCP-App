import { serveApp } from '@privos_ai/app-server';
import path from 'node:path';
import { lintManifest, SUPPORTED_MANIFEST_SCHEMA_VERSIONS } from '@privos_ai/app-server/manifest-tools';
import { buildRelayAppDescriptor, createManifest, MARKETPLACE_MANIFEST_FIELDS } from '../src/manifest';
import pkg from '../package.json';
import { createNodeCommandRunner, createNodeWorkspaceFiles } from './adapters/node-script-effects';
import { PREFLIGHT_RULESET, runPreflight } from './core/preflight';

async function checkRuntimeManifest(): Promise<boolean> {
  const manifest = createManifest();
  const handle = await serveApp({
    descriptor: buildRelayAppDescriptor(),
    createHandler: () => async () => ({}),
    port: 0,
    host: '0.0.0.0',
    installSignalHandlers: false,
    resolveManifest: () => manifest,
    configure: (app) => {
      app.get('/.well-known/mcp/manifest.json', (_req, res) => res.json(manifest));
    },
  });
  try {
    const address = handle.server.address();
    if (!address || typeof address === 'string') return false;
    const response = await fetch(`http://127.0.0.1:${address.port}/.well-known/mcp/manifest.json`);
    return response.ok && JSON.stringify(await response.json()) === JSON.stringify(manifest);
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  console.log(`PrivOS MCP app preflight (${PREFLIGHT_RULESET})`);
  console.log('NOTICE: these checks mirror the portal rules until the shared marketplace validation module is published.');
  const manifest = createManifest();
  const lint = lintManifest(manifest);
  console.log(`canonicalManifestHash=${lint.canonicalManifestHash}`);
  console.log(`publisherPermissionDeclarationHash=${lint.publisherPermissionDeclarationHash || '<unavailable>'}`);
  const result = await runPreflight({
    root: process.cwd(),
    paths: path,
    files: createNodeWorkspaceFiles(),
    commands: createNodeCommandRunner(),
    manifest,
    packageMeta: pkg,
    marketplaceFields: MARKETPLACE_MANIFEST_FIELDS,
    supportedSchemaVersions: SUPPORTED_MANIFEST_SCHEMA_VERSIONS,
    lint: async () => lint.errors,
    checkRuntimeManifest,
  });
  if (result.failures.length) {
    console.error(`\nPreflight failed (${result.failures.length}):\n- ${result.failures.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('Preflight passed.');
}

void main().catch((error: unknown) => {
  console.error(`Preflight crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
