import type { Clock, Scheduler } from '../../../shared/ports/effects';

export interface RequestBudget {
  run<T>(operation: () => Promise<T>): Promise<T>;
  dispose(): void;
}

export interface BudgetEffects {
  clock: Clock;
  scheduler: Scheduler;
  isRetryableReadError(error: unknown): boolean;
}

export interface RequestBudgetOptions {
  maxConcurrent?: number;
  maxPerWindow?: number;
  windowMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

/** A per-instance read scheduler. Other tabs and PrivOS apps have independent budgets. */
export function createRequestBudget(effects: BudgetEffects, options: RequestBudgetOptions = {}): RequestBudget {
  const maxConcurrent = options.maxConcurrent ?? 4;
  const maxPerWindow = options.maxPerWindow ?? 100;
  const windowMs = options.windowMs ?? 60_000;
  const maxRetries = options.maxRetries ?? 3;
  const baseBackoffMs = options.baseBackoffMs ?? 1_000;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || !Number.isInteger(maxPerWindow) || maxPerWindow < 1 || windowMs < 1 || maxRetries < 0 || baseBackoffMs < 1 || maxBackoffMs < baseBackoffMs) {
    throw new Error('REQUEST_BUDGET_INVALID');
  }

  const starts: number[] = [];
  const queue: Array<{ start(): void; reject(error: unknown): void }> = [];
  let active = 0;
  let pausedUntil = 0;
  let wakeCancel: (() => void) | undefined;
  let disposed = false;

  const now = (): number => effects.clock.now().getTime();

  function drain(): void {
    wakeCancel?.();
    wakeCancel = undefined;
    if (disposed) return;
    const current = now();
    while (starts.length && starts[0] <= current - windowMs) starts.shift();
    while (queue.length && active < maxConcurrent && starts.length < maxPerWindow && now() >= pausedUntil) {
      const job = queue.shift();
      if (!job) break;
      starts.push(now());
      active += 1;
      job.start();
    }
    if (!queue.length || active >= maxConcurrent) return;
    const nextWindow = starts.length >= maxPerWindow ? starts[0] + windowMs : 0;
    const nextStart = Math.max(nextWindow, pausedUntil);
    if (nextStart > now()) wakeCancel = effects.scheduler.after(nextStart - now(), drain);
  }

  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (disposed) { reject(new Error('SCOPE_DISPOSED')); return; }
        let retries = 0;
        const job = { reject, start: (): void => {
          let outcome: Promise<T>;
          try { outcome = operation(); }
          catch (error) { outcome = Promise.reject(error); }
          void outcome.then((value) => {
            active -= 1;
            drain();
            resolve(value);
          }, (error: unknown) => {
            if (!disposed && effects.isRetryableReadError(error) && retries < maxRetries) {
              const delay = Math.min(maxBackoffMs, baseBackoffMs * 2 ** retries);
              retries += 1;
              pausedUntil = Math.max(pausedUntil, now() + delay);
              queue.unshift(job);
            } else {
              reject(error);
            }
            active -= 1;
            drain();
          });
        } };
        queue.push(job);
        drain();
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      wakeCancel?.();
      wakeCancel = undefined;
      for (const job of queue.splice(0)) job.reject(new Error('SCOPE_DISPOSED'));
    },
  };
}
