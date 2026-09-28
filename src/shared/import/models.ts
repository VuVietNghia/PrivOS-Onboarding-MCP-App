import type { TemplateTree } from '../../ui/onboarding/domain/models';

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
  /** Previous CLI marker derived from the resolved absolute source path. */
  legacySourceFingerprint?: string;
  name: string;
  tree: TemplateTree;
}
