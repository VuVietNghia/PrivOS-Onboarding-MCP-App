import { expect, it } from 'vitest';
import { createRequestBudget } from '../../src/ui/onboarding/data/request-budget';

it('rejects queued reads after disposal without starting them', async () => {
  let finishFirst: (value: number) => void = () => { throw new Error('NOT_STARTED'); };
  const pending = new Promise<number>((resolve) => { finishFirst = resolve; });
  const budget = createRequestBudget({
    clock: { now: () => new Date('2026-09-25T00:00:00Z') },
    scheduler: { after: () => () => {} },
    isRetryableReadError: () => false,
  }, { maxConcurrent: 1 });
  let secondStarted = false;
  const first = budget.run(() => pending);
  const second = budget.run(async () => { secondStarted = true; return 2; });
  if (typeof budget.dispose !== 'function') {
    finishFirst(1);
    await Promise.all([first, second]);
    throw new Error('REQUEST_BUDGET_DISPOSE_MISSING');
  }
  const failure = expect(second).rejects.toThrow('SCOPE_DISPOSED');
  budget.dispose();
  await failure;
  expect(secondStarted).toBe(false);
  finishFirst(1);
  await expect(first).resolves.toBe(1);
  await expect(budget.run(async () => 3)).rejects.toThrow('SCOPE_DISPOSED');
});
