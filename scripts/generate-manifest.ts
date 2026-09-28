import path from 'node:path';
import { createManifest } from '../src/manifest';
import { createNodeWorkspaceFiles } from './adapters/node-script-effects';
import { generateManifest } from './core/generate-manifest';

const output = path.resolve('dist/manifest.json');
await generateManifest({ files: createNodeWorkspaceFiles(), manifest: createManifest(),
  outputDirectory: path.dirname(output), outputFile: output });
console.log(`Generated ${output}`);
