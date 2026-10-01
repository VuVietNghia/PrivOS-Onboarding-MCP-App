import { describe, expect, it } from 'vitest';
import type { Roadmap } from '../../src/ui/onboarding/domain/models';
import { validateRunTree } from '../../src/ui/onboarding/domain/run-tree';
function valid(): Roadmap {
  return { overviewId: 'overview', templateListId: 'template', tree: { weeks: [{ id: 'week', name: 'Week', order: 0 }], items: [
    { id: 'day', name: 'Day', kind: 'day', order: 1, stageId: 'week', parentId: null, content: '' },
    { id: 'lesson', name: 'Lesson', kind: 'lesson', order: 0, stageId: 'week', parentId: 'day', content: 'Read', attachments: [], videos: [], read: false },
  ] } };
}
describe('normalized run validation', () => {
  it('accepts normalized tree', () => expect(() => validateRunTree(valid())).not.toThrow());
  it.each([0, -1, 1.5])('rejects invalid day order %s', (order) => {
    const run = valid(); run.tree.items[0].order = order; expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
  it('rejects duplicate day order across weeks', () => {
    const run = valid(); run.tree.weeks.push({ id: 'week-2', name: 'Week 2', order: 1 });
    run.tree.items.push({ ...run.tree.items[0], id: 'day-2', stageId: 'week-2' });
    expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
  it.each(['missing', 'lesson'])('rejects orphan/cyclic lesson %s', (parentId) => {
    const run = valid(); run.tree.items[1].parentId = parentId; expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
  it.each(['day', 'week', 'overview'])('rejects cross-level duplicate ID %s', (id) => {
    const run = valid(); run.tree.items[1].id = id; expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
  it('rejects missing overview or duplicate weeks', () => {
    const run = valid(); run.overviewId = ''; expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
    run.overviewId = 'overview'; run.tree.weeks.push({ ...run.tree.weeks[0] }); expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
  it('rejects wrong child stage and native day parent', () => {
    const run = valid(); run.tree.items[1].stageId = 'missing'; expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
    run.tree.items[1].stageId = 'week'; run.tree.items[0].parentId = 'overview'; expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
  it('reuses quiz definition validation for malformed answers', () => {
    const run = valid();
    run.tree.items.push({ id: 'question', name: 'Question', kind: 'question', order: 1,
      stageId: 'week', parentId: 'day', content: 'Choose', options: ['A', 'B'],
      correctLabels: ['c'], explanation: '', selectedLabels: [], correct: null });
    expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
    const question = run.tree.items[2];
    if (question.kind !== 'question') throw new Error('TEST_FIXTURE');
    question.correctLabels = ['b'];
    expect(() => validateRunTree(run)).not.toThrow();
  });
  it('rejects negative week and child orders', () => {
    const run = valid(); run.tree.weeks[0].order = -1;
    expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
    run.tree.weeks[0].order = 0; run.tree.items[1].order = -1;
    expect(() => validateRunTree(run)).toThrow('RUN_INVALID');
  });
});
