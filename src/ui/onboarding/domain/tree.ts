import type { TemplateTree } from './models';

export type TreeErrorCode =
  | 'EMPTY_WEEK' | 'STAGE_MISSING' | 'DUPLICATE_ITEM_ID'
  | 'DAY_PARENT_INVALID' | 'DAY_ORDER_INVALID' | 'DUPLICATE_DAY_ORDER'
  | 'CHILD_PARENT_INVALID' | 'CHILD_STAGE_MISMATCH' | 'CHILD_ORDER_INVALID'
  | 'ROADMAP_OVERVIEW_MISSING';

export function validateTree(tree: TemplateTree, mode: 'template' | 'roadmap', overviewId?: string): TreeErrorCode[] {
  const errors = new Set<TreeErrorCode>();
  const stages = new Set(tree.weeks.map((week) => week.id));
  const items = new Map(tree.items.map((item) => [item.id, item]));
  const dayOrders = new Set<number>();
  const daysByStage = new Set<string>();

  if (items.size !== tree.items.length) errors.add('DUPLICATE_ITEM_ID');
  if (mode === 'roadmap' && !overviewId) errors.add('ROADMAP_OVERVIEW_MISSING');

  for (const item of tree.items) {
    if (!stages.has(item.stageId)) errors.add('STAGE_MISSING');
    if (item.kind === 'day') {
      daysByStage.add(item.stageId);
      if (mode === 'template' ? item.parentId !== null : item.parentId !== overviewId) errors.add('DAY_PARENT_INVALID');
      if (!Number.isInteger(item.order) || item.order <= 0) errors.add('DAY_ORDER_INVALID');
      if (dayOrders.has(item.order)) errors.add('DUPLICATE_DAY_ORDER');
      dayOrders.add(item.order);
    } else {
      const parent = item.parentId === null ? undefined : items.get(item.parentId);
      if (!parent || parent.kind !== 'day') errors.add('CHILD_PARENT_INVALID');
      else if (parent.stageId !== item.stageId) errors.add('CHILD_STAGE_MISMATCH');
      if (!Number.isInteger(item.order) || item.order < 0) errors.add('CHILD_ORDER_INVALID');
    }
  }

  for (const week of tree.weeks) if (!daysByStage.has(week.id)) errors.add('EMPTY_WEEK');
  return [...errors];
}
