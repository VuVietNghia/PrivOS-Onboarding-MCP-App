import { OnboardingError } from './errors';
import type { FieldDef, FieldIds } from './fields';
import type { ContentItem, TemplateTree, Week } from './models';
import { validateTree } from './tree';
import { V2, V2_TEMPLATE_FIELDS, resolveSelectLabels, resolveV2FieldIds } from './v2-fields';
import { normalizeHubItem, parseTemplateItems } from './v2-schemas';

type TemplateNode = Week | ContentItem;

function templateIds(definitions: readonly FieldDef[]): FieldIds {
  if (!definitions.some((definition) => definition.name === V2.parent && definition.type === 'TEXT')) {
    throw new OnboardingError('SCHEMA_MIGRATION_REQUIRED', V2.parent);
  }
  return resolveV2FieldIds(definitions, V2_TEMPLATE_FIELDS);
}

function field(item: ReturnType<typeof normalizeHubItem>, ids: FieldIds, name: string): unknown {
  return item.customFields.find((entry) => entry.fieldId === ids[name])?.value;
}

function selectLabel(value: unknown, definition: FieldDef): string {
  const raw = typeof value === 'object' && value !== null && 'value' in value ? value.value : value;
  if (typeof raw !== 'string') throw new OnboardingError('SCHEMA_DRIFT');
  return definition.options?.find((option) => option._id === raw)?.value ?? raw;
}

export function decodeTemplateTree(rows: readonly unknown[], definitions: readonly FieldDef[], contentStageId: string): TemplateTree {
  const ids = templateIds(definitions);
  const kindDefinition = definitions.find((definition) => definition._id === ids[V2.kind]);
  if (!kindDefinition) throw new OnboardingError('SCHEMA_DRIFT');
  const normalized = rows.map(normalizeHubItem);
  if (normalized.some((item) => item.stageId !== contentStageId)) throw new OnboardingError('SCHEMA_DRIFT');
  const weekRows = normalized.filter((item) => selectLabel(field(item, ids, V2.kind), kindDefinition) === 'Tuần');
  const weeks = weekRows.map((item): Week => {
    const order = field(item, ids, V2.order);
    if (field(item, ids, V2.parent) !== '' || item.parentId || typeof order !== 'number' || !Number.isInteger(order) || order < 0) throw new OnboardingError('SCHEMA_DRIFT');
    return { id: item._id, name: item.name, order };
  }).sort((a, b) => a.order - b.order);
  const weekIds = new Set(weeks.map((week) => week.id));
  const dayRows = normalized.filter((item) => selectLabel(field(item, ids, V2.kind), kindDefinition) === 'Ngày');
  const weekByDay = new Map<string, string>();
  for (const day of dayRows) {
    const parent = field(day, ids, V2.parent);
    if (typeof parent !== 'string' || !weekIds.has(parent) || (day.parentId && day.parentId !== parent)) throw new OnboardingError('SCHEMA_DRIFT');
    weekByDay.set(day._id, parent);
  }
  const items = parseTemplateItems(normalized.filter((item) => !weekIds.has(item._id)).map((item) => {
    const label = selectLabel(field(item, ids, V2.kind), kindDefinition);
    const logicalParent = field(item, ids, V2.parent);
    const weekId = label === 'Ngày' ? weekByDay.get(item._id) :
      typeof logicalParent === 'string' ? weekByDay.get(logicalParent) : undefined;
    if (!weekId) throw new OnboardingError('SCHEMA_DRIFT');
    if (label !== 'Ngày' && (typeof logicalParent !== 'string' || (item.parentId && item.parentId !== logicalParent))) throw new OnboardingError('SCHEMA_DRIFT');
    return { ...item, stageId: weekId, parentId: label === 'Ngày' ? null : logicalParent };
  }), ids, resolveSelectLabels(definitions), true);
  if (validateTree({ weeks, items }, 'template').some((code) => code !== 'EMPTY_WEEK')) throw new OnboardingError('SCHEMA_DRIFT');
  return { weeks, items };
}

export function encodeTemplateFields(node: TemplateNode, definitions: readonly FieldDef[], physicalParentId?: string): { fieldId: string; value: unknown }[] {
  const ids = templateIds(definitions);
  const kindDefinition = definitions.find((definition) => definition._id === ids[V2.kind]);
  const label = 'kind' in node ? { day: 'Ngày', lesson: 'Bài học', question: 'Câu hỏi' }[node.kind] : 'Tuần';
  const option = kindDefinition?.options?.find((candidate) => candidate.value === label);
  const optionId = option?._id;
  if (!optionId) throw new OnboardingError('SCHEMA_DRIFT');
  const values: { fieldId: string; value: unknown }[] = [
    { fieldId: ids[V2.kind], value: optionId }, { fieldId: ids[V2.order], value: node.order },
    { fieldId: ids[V2.parent], value: physicalParentId ?? '' },
  ];
  if (node.id.startsWith('draft:')) values.push({ fieldId: ids[V2.importSource], value: node.id });
  if (!('kind' in node)) return values;
  if (!physicalParentId) throw new OnboardingError('SCHEMA_DRIFT', V2.parent);
  values.push({ fieldId: ids[V2.content], value: node.content });
  if (node.kind === 'lesson') {
    values.push({ fieldId: ids[V2.attachments], value: node.attachments.map((ref) => {
      if (!ref.raw) throw new OnboardingError('SCHEMA_DRIFT');
      return ref.raw;
    }) });
    values.push({ fieldId: ids[V2.videos], value: node.videos.join('\n') });
  }
  if (node.kind === 'question') {
    values.push({ fieldId: ids[V2.options], value: node.options.join('\n') });
    values.push({ fieldId: ids[V2.answers], value: node.correctLabels.join(',') });
    values.push({ fieldId: ids[V2.multiple], value: node.correctLabels.length > 1 });
    values.push({ fieldId: ids[V2.explanation], value: node.explanation });
  }
  return values;
}
