import type { TemplateTree, Week } from '../../ui/onboarding/domain/models';
import type { ImportedPosition } from './models';
import { parseQuiz } from './parse-quiz';
import { validateSourcePath, type SourceDocument } from './source';

const COMMON = '00_Common_Onboarding';
const DAY = /^Day_(\d+)(?:_(.+))?$/u;
const WEEK = /^Week_(\d+)(?:_(.+))?$/u;

interface DayFiles {
  number: number;
  sourceKey: string;
  weekId: string;
  weekName: string;
  name: string;
  files: SourceDocument[];
}

function sourceDays(positionName: string, documents: readonly SourceDocument[]): DayFiles[] {
  const branches = new Map<string, Map<number, DayFiles>>();
  const seen = new Set<string>();
  for (const document of documents) {
    const parts = validateSourcePath(document.path);
    if (seen.has(document.path)) throw new Error('SOURCE_PATH_CONFLICT');
    seen.add(document.path);
    const branch = parts[0];
    if (branch !== COMMON && branch !== positionName) throw new Error('SOURCE_PATH_CONFLICT');
    if (!parts[parts.length - 1].toLowerCase().endsWith('.md')) continue;
    if (parts.length !== 3 && parts.length !== 4) throw new Error(`${document.path}: unsupported Markdown layout`);
    const dayName = parts.length === 3 ? parts[1] : parts[2];
    const weekName = parts.length === 4 ? parts[1] : 'Week_01';
    const week = weekName.match(WEEK);
    if (!week || !Number.isSafeInteger(Number(week[1])) || Number(week[1]) < 1) throw new Error(`${document.path}: invalid week`);
    const day = dayName.match(DAY);
    if (!day || !Number.isSafeInteger(Number(day[1])) || Number(day[1]) < 1) throw new Error(`${document.path}: invalid day`);
    const number = Number(day[1]);
    const sourceKey = parts.slice(0, -1).join('/');
    const branchDays = branches.get(branch) ?? new Map<number, DayFiles>();
    branches.set(branch, branchDays);
    const existing = branchDays.get(number);
    if (existing && existing.sourceKey !== sourceKey) throw new Error(`${branch}: duplicate Day_${String(number).padStart(2, '0')}`);
    const suffix = day[2]?.replace(/_/gu, ' ').trim();
    const entry = existing ?? {
      number, sourceKey, weekId: `${branch}/${weekName}`,
      weekName: week[2]?.replace(/_/gu, ' ').trim() || `Tuần ${Number(week[1])}`,
      name: suffix ? `Ngày ${number}: ${suffix}` : `Ngày ${number}`,
      files: [],
    };
    entry.files.push(document);
    branchDays.set(number, entry);
  }
  const selected = new Map(branches.get(COMMON) ?? []);
  for (const [number, day] of branches.get(positionName) ?? []) selected.set(number, day);
  if (!selected.size) throw new Error(`${positionName}: no Day_NN directories`);
  return [...selected.values()].sort((a, b) => a.number - b.number);
}

export function sourceFingerprintInput(rootName: string, positionName: string,
  documents: readonly SourceDocument[]): string {
  const parts = [`root\0${rootName}\0`];
  for (const day of sourceDays(positionName, documents)) {
    parts.push(`day\0${day.sourceKey}\0`);
    for (const file of [...day.files].sort((a, b) => a.path.localeCompare(b.path))) {
      parts.push(`file\0${file.path}\0${file.text.length}\0${file.text}\0`);
    }
  }
  return parts.join('');
}

export function assemblePosition(positionName: string, documents: readonly SourceDocument[],
  sourceFingerprint: string): ImportedPosition {
  const tree: TemplateTree = { weeks: [], items: [] };
  const weeks = new Map<string, Week>();
  for (const day of sourceDays(positionName, documents)) {
    if (!weeks.has(day.weekId)) weeks.set(day.weekId, { id: day.weekId, name: day.weekName, order: weeks.size });
    tree.items.push({ id: day.sourceKey, kind: 'day', name: day.name, stageId: day.weekId,
      order: day.number, parentId: null, content: '' });
    let order = 0;
    for (const file of [...day.files].sort((a, b) => a.path.localeCompare(b.path))) {
      const segments = file.path.split('/');
      const fileName = segments[segments.length - 1];
      if (fileName.toLowerCase().startsWith('quiz')) {
        for (const question of parseQuiz(file.text, file.path)) tree.items.push({
          id: question.sourceKey, kind: 'question', name: question.content,
          stageId: day.weekId, order: order++, parentId: day.sourceKey,
          content: question.content, options: question.options, correctLabels: question.correctLabels,
          explanation: question.explanation, selectedLabels: [], correct: null,
        });
      } else {
        const title = file.text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').match(/^#\s+(.+)$/mu)?.[1]?.trim();
        if (!title) throw new Error(`${file.path}:1 lesson needs a # title`);
        tree.items.push({ id: file.path, kind: 'lesson', name: title, stageId: day.weekId,
          order: order++, parentId: day.sourceKey, content: file.text, attachments: [], videos: [], read: false });
      }
    }
    if (!order) throw new Error(`${day.sourceKey}: no lesson or quiz questions`);
  }
  tree.weeks = [...weeks.values()];
  return { sourceKey: positionName, sourceFingerprint, name: positionName.replace(/_/gu, ' '), tree };
}
