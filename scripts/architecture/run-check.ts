import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDependencies, type SourceModule } from './check-dependencies';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function collect(directory: string, prefix: string): Promise<SourceModule[]> {
  const result: SourceModule[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await collect(path.join(directory, entry.name), relative));
    else if (/\.tsx?$/.test(entry.name)) result.push({ path: relative, text: await readFile(path.join(directory, entry.name), 'utf8') });
  }
  return result;
}

const sources = [...await collect(path.join(root, 'src'), 'src'), ...await collect(path.join(root, 'scripts'), 'scripts')];
const violations = checkDependencies(sources);
for (const value of violations) process.stderr.write(`${value.path}:${value.line} ${value.rule} ${value.target}\n`);
process.stdout.write(`DI architecture: ${sources.length} files, ${violations.length} violations\n`);
if (violations.length) process.exitCode = 1;
