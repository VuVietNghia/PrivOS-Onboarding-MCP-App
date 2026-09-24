import type { TemplateTree } from './models';
import { validateTree } from './tree';

export interface ReadinessIssue { code: string; itemId?: string; field: string }

export function validateReady(tree: TemplateTree, positionName: string): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const add = (code: string, field: string, itemId?: string) => issues.push({ code, field, ...(itemId ? { itemId } : {}) });
  if (!positionName.trim()) add('POSITION_NAME', 'positionName');
  if (!tree.weeks.length) add('NO_WEEK', 'weeks');
  for (const week of tree.weeks) {
    if (!week.name.trim()) add('WEEK_NAME', 'name', week.id);
    if (!tree.items.some((item) => item.kind === 'day' && item.stageId === week.id)) add('EMPTY_WEEK', 'days', week.id);
  }
  for (const code of validateTree(tree, 'template')) if (code !== 'EMPTY_WEEK') add(code, 'tree');
  const children = new Map<string, typeof tree.items>();
  for (const item of tree.items) {
    if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item]);
  }
  for (const item of tree.items) {
    if (item.kind === 'day') {
      if (!item.name.trim()) add('DAY_NAME', 'name', item.id);
      const validChild = (children.get(item.id) ?? []).some((child) => isValidContent(child));
      if (!validChild) add('EMPTY_DAY', 'items', item.id);
    } else if (item.kind === 'lesson') {
      if (!item.name.trim()) add('LESSON_TITLE', 'name', item.id);
      if (!item.content.trim()) add('LESSON_CONTENT', 'content', item.id);
    } else {
      if (!item.content.trim()) add('QUESTION_CONTENT', 'content', item.id);
      if (item.options.length < 2 || item.options.length > 10) add('OPTION_COUNT', 'options', item.id);
      if (item.options.some((option) => !option.trim())) add('OPTION_EMPTY', 'options', item.id);
      const allowed = new Set(item.options.map((_, index) => String.fromCharCode(97 + index)));
      if (!item.correctLabels.length || item.correctLabels.some((label) => !allowed.has(label)) || new Set(item.correctLabels).size !== item.correctLabels.length) add('ANSWER_INVALID', 'correctLabels', item.id);
    }
  }
  return issues;
}

function isValidContent(item: TemplateTree['items'][number]): boolean {
  if (item.kind === 'lesson') return !!item.name.trim() && !!item.content.trim();
  if (item.kind !== 'question') return false;
  const allowed = new Set(item.options.map((_, index) => String.fromCharCode(97 + index)));
  return !!item.content.trim() && item.options.length >= 2 && item.options.length <= 10 &&
    item.options.every((option) => !!option.trim()) && item.correctLabels.length > 0 &&
    item.correctLabels.every((label) => allowed.has(label)) && new Set(item.correctLabels).size === item.correctLabels.length;
}
