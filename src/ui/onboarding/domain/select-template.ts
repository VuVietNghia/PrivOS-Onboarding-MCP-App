import type { ContentItem, Day, Lesson, Question, TemplateTree, Week } from './models';
import { validateTree } from './tree';

export type CopySelection =
  | { kind: 'all' }
  | { kind: 'weeks'; weekIds: string[] }
  | { kind: 'days'; dayIds: string[] };

function draftId(): string { return `draft:copy:${crypto.randomUUID()}`; }
function fail(): never { throw new Error('COPY_SELECTION_INVALID'); }

export function selectTemplate(tree: TemplateTree, selection: CopySelection): TemplateTree {
  const weekById = new Map(tree.weeks.map((week) => [week.id, week]));
  const days = tree.items.filter((item): item is Day => item.kind === 'day');
  const dayById = new Map(days.map((day) => [day.id, day]));
  if (weekById.size !== tree.weeks.length || dayById.size !== days.length) fail();

  let selectedDayIds: Set<string>;
  if (selection.kind === 'all') selectedDayIds = new Set(days.map((day) => day.id));
  else if (selection.kind === 'weeks') {
    const ids = new Set(selection.weekIds);
    if (!ids.size || [...ids].some((id) => !weekById.has(id))) fail();
    selectedDayIds = new Set(days.filter((day) => ids.has(day.stageId)).map((day) => day.id));
  } else {
    selectedDayIds = new Set(selection.dayIds);
    if (!selectedDayIds.size || [...selectedDayIds].some((id) => !dayById.has(id))) fail();
  }
  if (!selectedDayIds.size) fail();
  const selectedDays = days.filter((day) => selectedDayIds.has(day.id));
  const selectedWeeks = tree.weeks.filter((week) => selectedDays.some((day) => day.stageId === week.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (selectedDays.some((day) => !weekById.has(day.stageId))) fail();

  const copiedWeeks: Week[] = [];
  const copiedItems: ContentItem[] = [];
  for (const week of selectedWeeks) {
    const weekId = draftId();
    copiedWeeks.push({ ...week, id: weekId });
    for (const day of selectedDays.filter((item) => item.stageId === week.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
      const dayId = draftId();
      copiedItems.push({ ...day, id: dayId, stageId: weekId, parentId: null, sourceId: day.id });
      const children = tree.items.filter((item): item is Lesson | Question => item.kind !== 'day' && item.parentId === day.id)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      for (const item of children) {
        const base = { id: draftId(), stageId: weekId, parentId: dayId, sourceId: item.id };
        if (item.kind === 'lesson') copiedItems.push({ ...item, ...base,
          attachments: item.attachments.map((ref) => ({ ...ref, ...(ref.raw ? { raw: structuredClone(ref.raw) } : {}) })),
          videos: [...item.videos], read: false });
        else copiedItems.push({ ...item, ...base, options: [...item.options],
          correctLabels: [...item.correctLabels], selectedLabels: [], correct: null });
      }
    }
  }
  const copied = { weeks: copiedWeeks, items: copiedItems };
  if (validateTree(copied, 'template').length) fail();
  return copied;
}
