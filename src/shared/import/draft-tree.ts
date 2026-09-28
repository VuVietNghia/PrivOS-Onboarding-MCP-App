import type { TemplateTree } from '../../ui/onboarding/domain/models';
import type { ImportedPosition } from './models';

export function importSourceMarker(position: ImportedPosition): string {
  return `${position.sourceKey}:${position.sourceFingerprint}`;
}

function draftId(sourceMarker: string, sourceId: string): string {
  return `draft:import:${sourceMarker}:${sourceId}`;
}

export function importDraftTree(position: ImportedPosition): TemplateTree {
  const marker = importSourceMarker(position);
  return {
    weeks: position.tree.weeks.map((week) => ({ ...week, id: draftId(marker, week.id) })),
    items: position.tree.items.map((item) => ({
      ...item, id: draftId(marker, item.id),
      stageId: draftId(marker, item.stageId),
      parentId: item.parentId === null ? null : draftId(marker, item.parentId),
    })),
  };
}
