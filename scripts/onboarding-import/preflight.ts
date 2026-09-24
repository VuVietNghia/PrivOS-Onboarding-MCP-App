import { validateReady } from '../../src/ui/onboarding/domain/template-readiness';
import { validateTree } from '../../src/ui/onboarding/domain/tree';
import type { ReadinessIssue } from '../../src/ui/onboarding/domain/template-readiness';
import type { ImportedPosition } from './models';

export interface ImportCounts {
  positions: number;
  weeks: number;
  days: number;
  lessons: number;
  questions: number;
}

export interface ImportPreflight {
  position: ImportedPosition;
  sourceFingerprint: string;
  counts: ImportCounts;
  missingAnswers: { sourceKey: string; question: string }[];
  readinessIssues: ReadinessIssue[];
  publishable: boolean;
}

export function preflightPosition(position: ImportedPosition): ImportPreflight {
  if (!/^[a-f0-9]{64}$/u.test(position.sourceFingerprint)) throw new Error(`${position.sourceKey}: invalid source fingerprint`);
  const treeErrors = validateTree(position.tree, 'template');
  if (treeErrors.length) throw new Error(`${position.sourceKey}: invalid source tree: ${treeErrors.join(', ')}`);
  const counts: ImportCounts = { positions: 1, weeks: position.tree.weeks.length, days: 0, lessons: 0, questions: 0 };
  const missingAnswers: ImportPreflight['missingAnswers'] = [];
  const readinessIssues = validateReady(position.tree, position.name);
  for (const item of position.tree.items) {
    switch (item.kind) {
      case 'day': counts.days++; break;
      case 'lesson':
        counts.lessons++;
        if (item.content.includes('[CẦN ĐIỀN')) readinessIssues.push({ code: 'PLACEHOLDER_CONTENT', field: 'content', itemId: item.id });
        break;
      case 'question':
        counts.questions++;
        if (!item.correctLabels.length) missingAnswers.push({ sourceKey: item.id, question: item.content });
        if (item.options.some((option) => option.includes('[CẦN ĐIỀN'))) readinessIssues.push({ code: 'PLACEHOLDER_OPTION', field: 'options', itemId: item.id });
        break;
    }
  }
  return {
    position, sourceFingerprint: position.sourceFingerprint, counts,
    missingAnswers, readinessIssues, publishable: readinessIssues.length === 0,
  };
}
