import { expect, it, vi } from 'vitest';
import { importTemplateKey } from '../../src/ui/onboarding/flows/import-v4';
import { createBrowserPositionSource } from '../../src/ui/onboarding/flows/browser-import-v4';
import { createNodePositionSource, createNodeHasher } from '../../scripts/onboarding-import/node-source';
import type { SourceFileSystem } from '../../src/shared/import/source';
import { createBrowserEffects } from '../../src/ui/adapters/browser-effects';

it('uses the supplied hasher for a stable import template key', async () => {
  const sha256 = vi.fn(async (_text: string) => 'a'.repeat(64));
  await expect(importTemplateKey('Engineering', { sha256 })).resolves.toBe('onb-tpl-import-' + 'a'.repeat(64));
  expect(sha256).toHaveBeenCalledWith('Engineering');
});

it('assembles the same position and fingerprint from browser and Node sources', async () => {
  const root = 'DemoRoot';
  const documents = new Map([
    [`${root}/00_Common_Onboarding/Day_01/intro.md`, '\uFEFF# Common\r\nCommon content'],
    [`${root}/Engineering/Week_02/Day_02/lesson.md`, '# Lesson\r\nBody'],
  ]);
  const browserFiles = [...documents].map(([path, content]) => ({
    name: path.split('/').slice(-1)[0], webkitRelativePath: path, text: async () => content,
  }));
  const fs: SourceFileSystem = {
    resolve: (...parts) => parts.join('/'),
    async readText(path) {
      const value = documents.get(path);
      if (value === undefined) throw new Error(`MISSING_FILE:${path}`);
      return value;
    },
    async list(path) {
      const prefix = `${path}/`;
      const entries = new Map<string, 'file' | 'directory'>();
      for (const key of documents.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const name = rest.split('/')[0];
        entries.set(name, rest.includes('/') ? 'directory' : 'file');
      }
      return [...entries].map(([name, kind]) => ({ name, kind }));
    },
  };
  const browser = [];
  for await (const position of createBrowserPositionSource(browserFiles, createBrowserEffects().hasher).positions()) browser.push(position);
  const node = [];
  for await (const position of createNodePositionSource(fs, root, createNodeHasher()).positions()) node.push(position);
  expect(browser).toEqual(node);
  expect(browser).toHaveLength(1);
  expect(browser[0].tree.items).toHaveLength(4);
});
