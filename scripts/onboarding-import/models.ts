import type { TemplateTree } from '../../src/ui/onboarding/domain/models';

export interface ImportedQuestion {
  sourceKey: string;
  content: string;
  options: string[];
  correctLabels: string[];
  explanation: string;
}

export interface ImportedPosition {
  sourceKey: string;
  sourceFingerprint: string;
  name: string;
  tree: TemplateTree;
}
