import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface BuiltChunk { file: string; imports?: string[]; isEntry?: boolean }
const dist = path.resolve('dist/ui');

describe('production UI bundle boundary', () => {
  it('contains only built browser chunks and excludes dev probes and Node entrypoints', async () => {
    const manifest = JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8')) as Record<string, BuiltChunk>;
    const entry = manifest['index.html'];
    expect(entry?.isEntry).toBe(true);
    const chunks = Object.values(manifest).filter((item) => item.file.endsWith('.js'));
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.file).toMatch(/^assets\/[\w-]+\.js$/);
      expect(chunk.imports?.every((dependency) => dependency in manifest) ?? true).toBe(true);
    }
    const code = (await Promise.all(chunks.map((chunk) => readFile(path.join(dist, chunk.file), 'utf8')))).join('\n');
    expect(code).not.toContain('P0 Hub contract tests');
    expect(code).not.toContain('P0.2 ACL and Files');
    expect(code).not.toContain('Host embed:');
    expect(code).not.toContain('node:fs');
    expect(code).not.toContain('node:child_process');
    expect(code).not.toContain('scripts/onboarding-import');
    expect(code).not.toContain('@privos_ai/app-server');
  });
});
