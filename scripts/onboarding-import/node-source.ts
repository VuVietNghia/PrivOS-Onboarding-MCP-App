import { createHash } from 'node:crypto';
import { opendir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Hasher } from '../../src/shared/ports/effects';
import { assemblePosition, sourceFingerprintInput } from '../../src/shared/import/assemble-position';
import type { PositionSource, SourceDocument, SourceFileSystem } from '../../src/shared/import/source';

export function createNodeHasher(): Hasher {
  return { sha256: async (text) => createHash('sha256').update(text).digest('hex') };
}

export function createNodeFileSystem(): SourceFileSystem {
  return {
    async list(path) {
      const entries: Array<{ name: string; kind: 'file' | 'directory' }> = [];
      const directory = await opendir(path);
      for await (const entry of directory) {
        if (entry.isFile()) entries.push({ name: entry.name, kind: 'file' });
        else if (entry.isDirectory()) entries.push({ name: entry.name, kind: 'directory' });
      }
      return entries;
    },
    readText: (path) => readFile(path, 'utf8'),
    resolve: (...parts) => join(...parts),
    realPath: (path) => realpath(path),
  };
}

async function documentsFor(fs: SourceFileSystem, source: string, branch: string): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];
  const branchPath = fs.resolve(source, branch);
  const rootEntries = await fs.list(branchPath);
  const folders: Array<{ path: string; key: string }> = [];
  for (const entry of rootEntries) {
    if (entry.kind !== 'directory') continue;
    if (entry.name.startsWith('Week_')) {
      for (const day of await fs.list(fs.resolve(branchPath, entry.name))) {
        if (day.kind === 'directory' && day.name.startsWith('Day_')) {
          folders.push({ path: fs.resolve(branchPath, entry.name, day.name), key: `${branch}/${entry.name}/${day.name}` });
        }
      }
    } else if (entry.name.startsWith('Day_')) {
      folders.push({ path: fs.resolve(branchPath, entry.name), key: `${branch}/${entry.name}` });
    }
  }
  for (const folder of folders) {
    for (const entry of await fs.list(folder.path)) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.md')) continue;
      documents.push({ path: `${folder.key}/${entry.name}`, text: await fs.readText(fs.resolve(folder.path, entry.name)) });
    }
  }
  return documents;
}

export function createNodePositionSource(fs: SourceFileSystem, source: string, hasher: Hasher): PositionSource {
  return { async *positions() {
    const rootName = source.replace(/\\/gu, '/').split('/').filter(Boolean).pop();
    if (!rootName) throw new Error('SOURCE_PATH_INVALID');
    const legacyRoot = fs.realPath ? await hasher.sha256(await fs.realPath(source)) : undefined;
    const branches = (await fs.list(source)).filter((entry) => entry.kind === 'directory').map((entry) => entry.name);
    const common = branches.includes('00_Common_Onboarding') ? '00_Common_Onboarding' : null;
    for (const branch of branches.filter((entry) => entry !== '00_Common_Onboarding').sort((a, b) => a.localeCompare(b))) {
      const documents = [
        ...(common ? await documentsFor(fs, source, common) : []),
        ...await documentsFor(fs, source, branch),
      ];
      const fingerprint = await hasher.sha256(sourceFingerprintInput(rootName, branch, documents));
      const legacySourceFingerprint = legacyRoot
        ? await hasher.sha256(sourceFingerprintInput(legacyRoot, branch, documents)) : undefined;
      yield { ...assemblePosition(branch, documents, fingerprint),
        ...(legacySourceFingerprint ? { legacySourceFingerprint } : {}) };
    }
  } };
}
