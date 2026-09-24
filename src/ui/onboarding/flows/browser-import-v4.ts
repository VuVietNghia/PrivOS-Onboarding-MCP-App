import type { McpApp } from '@privos_ai/app-react';
import type { ImportedPosition } from '../../../../scripts/onboarding-import/models';
import { parseQuiz } from '../../../../scripts/onboarding-import/parse-quiz';
import { preflightPosition, type ImportPreflight } from '../../../../scripts/onboarding-import/preflight';
import type { RoomBinding, TemplateTree, Week } from '../domain/models';
import { isRoomAdmin } from '../domain/roles';
import { createMcpImportV4Gateway, importPositionV4, type ImportPositionOutcome, type ImportV4Gateway } from './import-v4';

export interface BrowserImportFile {
  name: string;
  webkitRelativePath: string;
  text(): Promise<string>;
}

interface DayFiles {
  number: number;
  sourceKey: string;
  weekId: string;
  weekName: string;
  name: string;
  files: { key: string; file: BrowserImportFile }[];
}

type Branches = Map<string, Map<number, DayFiles>>;
const commonName = '00_Common_Onboarding';
const dayPattern = /^Day_(\d+)(?:_(.+))?$/u;
const weekPattern = /^Week_(\d+)(?:_(.+))?$/u;

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function directoryFile(file: BrowserImportFile): string[] {
  const path = file.webkitRelativePath;
  if (!path || path.includes('\\') || path.startsWith('/') || path.endsWith('/') || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('SOURCE_PATH_INVALID');
  }
  const parts = path.split('/');
  if (parts[parts.length - 1] !== file.name) throw new Error('SOURCE_PATH_INVALID');
  return parts;
}

function collectMetadata(files: ArrayLike<BrowserImportFile>): { rootName: string; branches: Branches } {
  const branches: Branches = new Map();
  const seen = new Set<string>();
  let rootName = '';
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const parts = directoryFile(file);
    if (!rootName) rootName = parts[0];
    if (parts[0] !== rootName || seen.has(file.webkitRelativePath)) throw new Error('SOURCE_PATH_CONFLICT');
    seen.add(file.webkitRelativePath);
    if (!file.name.toLowerCase().endsWith('.md') || parts.length === 2) continue;
    const branchName = parts[1];
    let dayDirectory: string;
    let weekId: string;
    let weekName: string;
    if (parts.length === 4) {
      dayDirectory = parts[2];
      weekId = `${branchName}/Week_01`;
      weekName = 'Tuần 1';
    } else if (parts.length === 5) {
      const week = parts[2].match(weekPattern);
      if (!week || !Number.isSafeInteger(Number(week[1])) || Number(week[1]) < 1) throw new Error(`${file.webkitRelativePath}: invalid week`);
      dayDirectory = parts[3];
      weekId = `${branchName}/${parts[2]}`;
      weekName = week[2]?.replace(/_/gu, ' ').trim() || `Tuần ${Number(week[1])}`;
    } else throw new Error(`${file.webkitRelativePath}: unsupported Markdown layout`);
    const day = dayDirectory.match(dayPattern);
    if (!day || !Number.isSafeInteger(Number(day[1])) || Number(day[1]) < 1) throw new Error(`${file.webkitRelativePath}: invalid day`);
    const number = Number(day[1]);
    const sourceKey = parts.slice(1, -1).join('/');
    const days = branches.get(branchName) ?? new Map<number, DayFiles>();
    branches.set(branchName, days);
    const existing = days.get(number);
    if (existing && existing.sourceKey !== sourceKey) throw new Error(`${branchName}: duplicate Day_${String(number).padStart(2, '0')}`);
    const suffix = day[2]?.replace(/_/gu, ' ').trim();
    const entry = existing ?? { number, sourceKey, weekId, weekName,
      name: suffix ? `Ngày ${number}: ${suffix}` : `Ngày ${number}`, files: [] };
    entry.files.push({ key: parts.slice(1).join('/'), file });
    days.set(number, entry);
  }
  if (!rootName) throw new Error('SOURCE_EMPTY');
  if (![...branches.keys()].some((branch) => branch !== commonName)) throw new Error('SOURCE_NO_POSITIONS');
  return { rootName, branches };
}

async function buildPosition(rootName: string, positionName: string, branches: Branches): Promise<ImportedPosition> {
  const selected = new Map(branches.get(commonName) ?? []);
  for (const [number, day] of branches.get(positionName) ?? []) selected.set(number, day);
  const tree: TemplateTree = { weeks: [], items: [] };
  const weeks = new Map<string, Week>();
  const fingerprintParts = [`root\0${rootName}\0`];
  for (const day of [...selected.values()].sort((a, b) => a.number - b.number)) {
    if (!weeks.has(day.weekId)) weeks.set(day.weekId, { id: day.weekId, name: day.weekName, order: weeks.size });
    fingerprintParts.push(`day\0${day.sourceKey}\0`);
    tree.items.push({ id: day.sourceKey, kind: 'day', name: day.name, stageId: day.weekId, order: day.number, parentId: null, content: '' });
    let order = 0;
    for (const { key, file } of [...day.files].sort((a, b) => a.key.localeCompare(b.key))) {
      const markdown = await file.text();
      fingerprintParts.push(`file\0${key}\0${markdown.length}\0${markdown}\0`);
      if (file.name.toLowerCase().startsWith('quiz')) {
        for (const question of parseQuiz(markdown, key)) tree.items.push({
          id: question.sourceKey, kind: 'question', name: question.content,
          stageId: day.weekId, order: order++, parentId: day.sourceKey,
          content: question.content, options: question.options, correctLabels: question.correctLabels,
          explanation: question.explanation, selectedLabels: [], correct: null,
        });
      } else {
        const title = markdown.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').match(/^#\s+(.+)$/mu)?.[1]?.trim();
        if (!title) throw new Error(`${key}:1 lesson needs a # title`);
        tree.items.push({ id: key, kind: 'lesson', name: title, stageId: day.weekId,
          order: order++, parentId: day.sourceKey, content: markdown, attachments: [], videos: [], read: false });
      }
    }
    if (!order) throw new Error(`${day.sourceKey}: no lesson or quiz questions`);
  }
  tree.weeks = [...weeks.values()];
  return { sourceKey: positionName, sourceFingerprint: await sha256(fingerprintParts.join('')),
    name: positionName.replace(/_/gu, ' '), tree };
}

export async function* readBrowserPositions(files: ArrayLike<BrowserImportFile>): AsyncGenerator<ImportedPosition> {
  const { rootName, branches } = collectMetadata(files);
  for (const name of [...branches.keys()].filter((branch) => branch !== commonName).sort((a, b) => a.localeCompare(b))) {
    yield await buildPosition(rootName, name, branches);
  }
}

export type BrowserImportOptions = { dryRun: true } | {
  dryRun: false; roomId: string; actorRoomId: string; actorRoles: readonly string[]; gateway: ImportV4Gateway;
};
export type BrowserImportResult = { state: 'dry-run'; preflight: ImportPreflight } | ImportPositionOutcome;

export async function* importBrowserFilesV4(files: ArrayLike<BrowserImportFile>, options: BrowserImportOptions): AsyncGenerator<BrowserImportResult> {
  if (!options.dryRun) {
    if (!isRoomAdmin(options.actorRoles)) throw new Error('NOT_ADMIN');
    if (!options.actorRoomId || options.actorRoomId !== options.roomId) throw new Error('ROOM_MISMATCH');
  }
  for await (const position of readBrowserPositions(files)) {
    yield options.dryRun ? { state: 'dry-run', preflight: preflightPosition(position) }
      : await importPositionV4(options.gateway, position);
  }
}

export function importBrowserFolderV4(app: McpApp, binding: RoomBinding, actorRoomId: string,
  actorRoles: readonly string[], files: ArrayLike<BrowserImportFile>): AsyncGenerator<BrowserImportResult> {
  return importBrowserFilesV4(files, { dryRun: false, roomId: binding.roomId, actorRoomId, actorRoles,
    gateway: createMcpImportV4Gateway(app, binding) });
}
