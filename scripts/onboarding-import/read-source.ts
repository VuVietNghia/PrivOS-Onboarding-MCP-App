import { createHash } from 'node:crypto';
import { opendir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { TemplateTree, Week } from '../../src/ui/onboarding/domain/models';
import type { ImportedPosition } from './models';
import { parseQuiz } from './parse-quiz';

interface DaySource {
  number: number;
  name: string;
  absolutePath: string;
  sourceKey: string;
  weekId: string;
  weekName: string;
}

const dayPattern = /^Day_(\d+)(?:_(.+))?$/u;
const weekPattern = /^Week_(\d+)(?:_(.+))?$/u;
const commonName = '00_Common_Onboarding';

async function* subdirectories(path: string): AsyncGenerator<string> {
  const directory = await opendir(path);
  for await (const entry of directory) if (entry.isDirectory()) yield entry.name;
}

async function scanDays(root: string, branchName: string): Promise<Map<number, DaySource>> {
  const branchPath = join(root, branchName);
  const days = new Map<number, DaySource>();
  const add = (directoryName: string, parentPath: string, parentKey: string, weekId: string, weekName: string): void => {
    const match = directoryName.match(dayPattern);
    if (!match) return;
    const number = Number(match[1]);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${parentKey}/${directoryName}: invalid day number`);
    if (days.has(number)) throw new Error(`${branchName}: duplicate Day_${String(number).padStart(2, '0')}`);
    const suffix = match[2]?.replace(/_/gu, ' ').trim();
    days.set(number, {
      number,
      name: suffix ? `Ngày ${number}: ${suffix}` : `Ngày ${number}`,
      absolutePath: join(parentPath, directoryName),
      sourceKey: `${parentKey}/${directoryName}`,
      weekId,
      weekName,
    });
  };

  for await (const entryName of subdirectories(branchPath)) {
    const week = entryName.match(weekPattern);
    if (week) {
      const weekNumber = Number(week[1]);
      if (!Number.isSafeInteger(weekNumber) || weekNumber < 1) throw new Error(`${branchName}/${entryName}: invalid week number`);
      const weekName = week[2]?.replace(/_/gu, ' ').trim() || `Tuần ${weekNumber}`;
      const weekPath = join(branchPath, entryName);
      for await (const dayName of subdirectories(weekPath)) add(dayName, weekPath, `${branchName}/${entryName}`, `${branchName}/${entryName}`, weekName);
    } else {
      add(entryName, branchPath, branchName, `${branchName}/Week_01`, 'Tuần 1');
    }
  }
  return days;
}

async function buildPosition(root: string, positionName: string, commonExists: boolean, rootFingerprint: string): Promise<ImportedPosition> {
  const positionDays = await scanDays(root, positionName);
  const merged = commonExists ? await scanDays(root, commonName) : new Map<number, DaySource>();
  for (const [number, day] of positionDays) merged.set(number, day);
  if (!merged.size) throw new Error(`${positionName}: no Day_NN directories`);

  const hash = createHash('sha256');
  hash.update(`root\0${rootFingerprint}\0`);
  const tree: TemplateTree = { weeks: [], items: [] };
  const weeks = new Map<string, Week>();
  for (const day of [...merged.values()].sort((a, b) => a.number - b.number)) {
    if (!weeks.has(day.weekId)) weeks.set(day.weekId, { id: day.weekId, name: day.weekName, order: weeks.size });
    hash.update(`day\0${day.sourceKey}\0`);
    tree.items.push({ id: day.sourceKey, kind: 'day', name: day.name, stageId: day.weekId, order: day.number, parentId: null, content: '' });
    let order = 0;
    const fileNames: string[] = [];
    const directory = await opendir(day.absolutePath);
    for await (const entry of directory) if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) fileNames.push(entry.name);
    for (const fileName of fileNames.sort((a, b) => a.localeCompare(b))) {
      const fileKey = `${day.sourceKey}/${fileName}`;
      const markdown = await readFile(join(day.absolutePath, fileName), 'utf8');
      hash.update(`file\0${fileKey}\0${markdown.length}\0${markdown}\0`);
      if (fileName.toLowerCase().startsWith('quiz')) {
        for (const question of parseQuiz(markdown, fileKey)) {
          tree.items.push({
            id: question.sourceKey, kind: 'question', name: question.content,
            stageId: day.weekId, order: order++, parentId: day.sourceKey,
            content: question.content, options: question.options,
            correctLabels: question.correctLabels, explanation: question.explanation,
            selectedLabels: [], correct: null,
          });
        }
      } else {
        const title = markdown.replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n').match(/^#\s+(.+)$/mu)?.[1]?.trim();
        if (!title) throw new Error(`${fileKey}:1 lesson needs a # title`);
        tree.items.push({
          id: fileKey, kind: 'lesson', name: title, stageId: day.weekId,
          order: order++, parentId: day.sourceKey, content: markdown,
          attachments: [], videos: [], read: false,
        });
      }
    }
    if (!order) throw new Error(`${day.sourceKey}: no lesson or quiz questions`);
  }
  tree.weeks = [...weeks.values()];
  return {
    sourceKey: positionName,
    sourceFingerprint: hash.digest('hex'),
    name: positionName.replace(/_/gu, ' '),
    tree,
  };
}

export async function* readPositions(source: string): AsyncGenerator<ImportedPosition> {
  const rootFingerprint = createHash('sha256').update(await realpath(source)).digest('hex');
  let commonExists = false;
  for await (const entryName of subdirectories(source)) if (entryName === commonName) commonExists = true;
  for await (const entryName of subdirectories(source)) {
    if (entryName === commonName) continue;
    yield await buildPosition(source, entryName, commonExists, rootFingerprint);
  }
}
