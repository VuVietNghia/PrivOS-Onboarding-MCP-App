import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivosRestError } from '../../src/ui/privos-rest';
import { createRequestBudget } from '../../src/ui/onboarding/data/request-budget';

afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('request budget', () => {
  it('runs at most four requests concurrently', async () => {
    const budget = createRequestBudget();
    const slots = Array.from({ length: 5 }, () => deferred<number>());
    const invoked: number[] = [];
    const results = slots.map((slot, index) => budget.run(() => {
      invoked.push(index);
      return slot.promise;
    }));
    expect(invoked).toEqual([0, 1, 2, 3]);
    slots[0].resolve(0);
    await results[0];
    expect(invoked).toEqual([0, 1, 2, 3, 4]);
    slots.slice(1).forEach((slot, index) => slot.resolve(index + 1));
    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2, 3, 4]);
  });

  it('sends no more than the configured window allowance', async () => {
    vi.useFakeTimers();
    const budget = createRequestBudget({ maxPerWindow: 2, windowMs: 1_000 });
    const sent: number[] = [];
    const calls = [0, 1, 2].map((index) => budget.run(async () => { sent.push(index); return index; }));
    await vi.advanceTimersByTimeAsync(999);
    expect(sent).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([0, 1, 2]);
    await expect(Promise.all(calls)).resolves.toEqual([0, 1, 2]);
  });

  it('retries a read after 429 with bounded backoff', async () => {
    vi.useFakeTimers();
    const budget = createRequestBudget({ baseBackoffMs: 100, maxBackoffMs: 200 });
    let attempts = 0;
    const result = budget.run(async () => {
      attempts += 1;
      if (attempts < 3) throw new PrivosRestError('rate limited', 429);
      return 'ok';
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('stops retrying after the configured cap and never retries other errors', async () => {
    vi.useFakeTimers();
    const budget = createRequestBudget({ maxRetries: 1, baseBackoffMs: 20 });
    let rateAttempts = 0;
    const rate = budget.run(async () => {
      rateAttempts += 1;
      throw new PrivosRestError('rate limited', 429);
    });
    const rateFailure = expect(rate).rejects.toMatchObject({ statusCode: 429 });
    await vi.advanceTimersByTimeAsync(20);
    await rateFailure;
    expect(rateAttempts).toBe(2);

    let otherAttempts = 0;
    await expect(budget.run(async () => {
      otherAttempts += 1;
      throw new PrivosRestError('forbidden', 403);
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(otherAttempts).toBe(1);
  });
});
