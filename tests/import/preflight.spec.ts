import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPositions } from '../../scripts/onboarding-import/read-source';
import { preflightPosition } from '../../scripts/onboarding-import/preflight';

const demo = fileURLToPath(new URL('../../../AgentFiles onboarding/', import.meta.url));

describe('preflightPosition', () => {
  it('reports bounded counts and leaves placeholder answers as draft', async () => {
    const iterator = readPositions(demo);
    const first = (await iterator.next()).value;
    expect(first).toBeDefined();
    if (!first) throw new Error('missing demo position');
    const plan = preflightPosition(first);
    expect(plan.counts.positions).toBe(1);
    expect(plan.counts.days).toBe(4);
    expect(plan.counts.questions).toBeGreaterThan(20);
    expect(plan.missingAnswers.length).toBeGreaterThan(0);
    expect(plan.publishable).toBe(false);
    expect(plan.sourceFingerprint).toBe(first.sourceFingerprint);
  });
});
