import { OnboardingError } from './errors';
import type { Roadmap, TemplateTree } from './models';
import { gradeDay } from './quiz';
import { validateTree } from './tree';

/** Validate the logical run: day parents are null and stages identify weeks. */
export function validateRunTree(roadmap: Roadmap): void {
  const tree: TemplateTree = roadmap.tree;
  const ids = [roadmap.overviewId, ...tree.weeks.map((week) => week.id), ...tree.items.map((item) => item.id)];
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length || !tree.weeks.length ||
      tree.weeks.some((week) => !week.name.trim() || !Number.isInteger(week.order) || week.order < 0) ||
      validateTree(tree, 'template').length > 0) throw new OnboardingError('RUN_INVALID');

  for (const item of tree.items) {
    if (item.kind !== 'question') continue;
    try {
      // Reuse grading's quiz definition checks without interpreting saved answers.
      gradeDay([item], { [item.id]: item.correctLabels });
    } catch {
      throw new OnboardingError('RUN_INVALID');
    }
  }
}
